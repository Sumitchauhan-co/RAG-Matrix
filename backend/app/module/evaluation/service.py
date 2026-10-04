import gc
import logging
import math
import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Tuple

import pymupdf  # PyMuPDF
from langchain_core.documents import Document
from ragas.run_config import RunConfig

from app.common.utils.config import (
    APP_ENV,
    DATABASE_URL,
    DEV_EMBED_MODEL_1,
    DEV_LLM_MODEL_1,
    DEV_VECTOR_DB,
    EVALUATION_ANSWER_MODE,
    EVALUATION_ANSWER_WORKERS,
    EVALUATION_CONTEXT_CHARS_PER_DOC,
    EVALUATION_FAST_INDEX,
    EVALUATION_MAX_INDEX_CHUNKS,
    EVALUATION_METRIC_MODE,
    EVALUATION_MIN_INDEX_CHUNKS,
    EVALUATION_RAGAS_RETRIES,
    EVALUATION_RAGAS_TIMEOUT,
    EVALUATION_RAGAS_WORKERS,
    EVALUATION_RETRIEVER_MODE,
    OLLAMA_BASE_URL,
    OPENAI_API_KEY,
    PROD_EMBED_MODEL_1,
    PROD_LLM_MODEL_1,
    PROD_VECTOR_DB,
)

DEFAULT_TEST_DATASET = [
    {
        "question": "What machine learning models are combined in this approach for peak detection?",
        "ground_truth": "A Convolutional Neural Network (CNN) combined with Particle Swarm Optimization (PSO).",
    },
    {
        "question": "What evaluation accuracy was reported for ECG peak detection?",
        "ground_truth": "The reported experimental accuracy was 99.57%.",
    },
    {
        "question": "Which database was used to evaluate the peak detection method?",
        "ground_truth": "The MIT-BIH Arrhythmia Database was used.",
    },
]

logger = logging.getLogger(__name__)

QUERY_STOPWORDS = {
    "about",
    "above",
    "accuracy",
    "after",
    "also",
    "answer",
    "approach",
    "based",
    "been",
    "being",
    "combined",
    "database",
    "detection",
    "does",
    "each",
    "from",
    "have",
    "into",
    "machine",
    "method",
    "model",
    "models",
    "reported",
    "that",
    "their",
    "there",
    "these",
    "this",
    "used",
    "using",
    "what",
    "which",
    "with",
}


def elapsed_ms(start_time: float) -> float:
    return round((time.perf_counter() - start_time) * 1000, 2)


def emit_eval_log(event: str, **values: Any) -> None:
    details = " ".join(f"{key}={value}" for key, value in values.items())
    message = f"evaluation.{event} {details}".strip()
    logger.info(message)
    print(message, flush=True)


def tokenize_for_metric(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-zA-Z0-9][a-zA-Z0-9_.-]*", text.lower())
        if len(token) >= 3 and token not in QUERY_STOPWORDS
    }


def overlap_ratio(source_terms: set[str], target_terms: set[str]) -> float:
    if not source_terms:
        return 0.0
    return len(source_terms & target_terms) / len(source_terms)


class LexicalChunkRetriever:
    def __init__(self, chunks: List[Document], k: int = 3):
        self.chunks = chunks
        self.k = k

    def invoke(self, query: str) -> List[Document]:
        query_terms = tokenize_for_metric(query)
        if not query_terms:
            return self.chunks[: self.k]

        scored_chunks = [
            (
                overlap_ratio(query_terms, tokenize_for_metric(chunk.page_content)),
                index,
                chunk,
            )
            for index, chunk in enumerate(self.chunks)
        ]
        # Filter matching chunks with score > 0 before slicing top k
        scored_chunks = [item for item in scored_chunks if item[0] > 0]
        scored_chunks.sort(key=lambda item: (-item[0], item[1]))

        selected = [chunk for _, _, chunk in scored_chunks[: self.k]]
        return selected or self.chunks[: self.k]


def sanitize_namespace(name: str) -> str:
    """Sanitizes model and strategy strings into safe collection identifiers for vector stores."""
    return re.sub(r"[^a-zA-Z0-9_-]", "-", name)


def calculate_agentic_multiplier(
    extracted_text_chars: int,
    batch_size: int = 5,
    max_llm_calls: int = 40,
    avg_sentence_chars: int = 80,
) -> float:
    """
    Calculates agentic strategy multiplier based on extracted raw character length.
    Strictly caps multiplier by max_llm_calls bound to keep billing aligned with API caps.
    """
    if extracted_text_chars <= 0:
        return 2.0

    estimated_sentences = math.ceil(extracted_text_chars / avg_sentence_chars)
    estimated_batches = math.ceil(estimated_sentences / max(1, batch_size))

    expected_calls = min(estimated_batches, max_llm_calls)

    multiplier = 2.0 + (expected_calls * 0.15)
    max_multiplier_cap = round(2.0 + (max_llm_calls * 0.15), 2)
    return round(min(multiplier, max_multiplier_cap), 2)


class AgenticChunkSplitter:
    """Agentic Chunking strategy using batched LLM candidate boundary evaluations."""

    def __init__(
        self,
        llm: Any,
        max_chunk_size: int = 1000,
        max_llm_calls: int = 40,
        batch_size: int = 5,
        user_credit_balance: int | None = None,
        estimated_credits: int | None = None,
    ):
        self.llm = llm
        self.max_chunk_size = max_chunk_size
        self.max_llm_calls = max_llm_calls
        self.batch_size = batch_size
        self.user_credit_balance = user_credit_balance
        self.estimated_credits = estimated_credits

    def _evaluate_batch_boundaries(self, sentences: List[str]) -> List[bool]:
        """Evaluates multiple sentence transition points in a single LLM pass."""
        numbered_sentences = "\n".join(
            [f"[{i+1}] {s}" for i, s in enumerate(sentences)]
        )
        prompt = (
            f"Analyze the following ordered sentences. Identify sentence indices where a NEW semantic topic or concept begins.\n"
            f"Respond ONLY with a comma-separated list of split indices (e.g., '2, 5'). If no split is needed, respond 'NONE'.\n\n"
            f"{numbered_sentences}"
        )
        try:
            response = self.llm.invoke(prompt)
            content = (
                response.content if hasattr(response, "content") else str(response)
            )

            splits = [False] * len(sentences)
            if "NONE" not in content.upper():
                indices = [int(i.strip()) - 1 for i in re.findall(r"\b\d+\b", content)]
                for idx in indices:
                    if 0 <= idx < len(sentences):
                        splits[idx] = True
            return splits
        except Exception as err:
            logger.warning(f"Batch boundary evaluation failed: {err}")
            return [False] * len(sentences)

    def split_documents(self, documents: List[Document]) -> List[Document]:
        emit_eval_log(
            "agentic_split_started",
            user_credit_balance=self.user_credit_balance,
            estimated_credits=self.estimated_credits,
        )

        chunked_docs = []
        llm_call_count = 0

        for doc in documents:
            sentences = [
                s.strip()
                for s in re.split(r"(?<=[.!?])\s+", doc.page_content)
                if s.strip()
            ]
            if not sentences:
                continue

            current_chunk = ""
            idx = 0

            while idx < len(sentences):
                sentence = sentences[idx]

                if len(current_chunk) + len(sentence) > self.max_chunk_size:
                    if current_chunk:
                        chunked_docs.append(
                            Document(
                                page_content=current_chunk, metadata=dict(doc.metadata)
                            )
                        )
                    current_chunk = sentence
                    idx += 1
                    continue

                if not current_chunk:
                    current_chunk = sentence
                    idx += 1
                    continue

                if llm_call_count < self.max_llm_calls:
                    batch_candidates = sentences[idx : idx + self.batch_size]
                    llm_call_count += 1
                    split_decisions = self._evaluate_batch_boundaries(batch_candidates)

                    split_occurred = False
                    for b_idx, should_split in enumerate(split_decisions):
                        cand_sentence = batch_candidates[b_idx]
                        if should_split or (
                            len(current_chunk) + len(cand_sentence)
                            > self.max_chunk_size
                        ):
                            if current_chunk:
                                chunked_docs.append(
                                    Document(
                                        page_content=current_chunk,
                                        metadata=dict(doc.metadata),
                                    )
                                )
                            current_chunk = cand_sentence
                            split_occurred = True
                            idx += b_idx + 1
                            break
                        else:
                            current_chunk += f" {cand_sentence}"

                    if not split_occurred:
                        idx += len(batch_candidates)
                else:
                    if len(current_chunk) + len(sentence) > 500:
                        chunked_docs.append(
                            Document(
                                page_content=current_chunk, metadata=dict(doc.metadata)
                            )
                        )
                        current_chunk = sentence
                    else:
                        current_chunk += f" {sentence}"
                    idx += 1

            if current_chunk:
                chunked_docs.append(
                    Document(page_content=current_chunk, metadata=dict(doc.metadata))
                )

        return chunked_docs


class RAGBenchmarkEngine:
    def __init__(
        self,
        pdf_bytes: bytes,
        filename: str = "document.pdf",
        metric_mode: str | None = None,
        answer_mode: str | None = None,
        retriever_mode: str | None = None,
    ):
        self.metric_mode = (metric_mode or EVALUATION_METRIC_MODE).lower()
        self.answer_mode = (answer_mode or EVALUATION_ANSWER_MODE).lower()
        self.retriever_mode = (retriever_mode or EVALUATION_RETRIEVER_MODE).lower()
        load_start = time.perf_counter()
        self.raw_docs = self._load_pdf_with_pymupdf(pdf_bytes, filename)
        self.extracted_text_chars = sum(len(doc.page_content) for doc in self.raw_docs)
        self._retriever_cache: Dict[Tuple[str, str], Tuple[Any, Any]] = {}

        if not self.raw_docs:
            raise ValueError("PDF contains no extractable text pages.")

        emit_eval_log(
            "pdf_loaded",
            filename=filename,
            pages=len(self.raw_docs),
            bytes=len(pdf_bytes),
            chars=self.extracted_text_chars,
            metric_mode=self.metric_mode,
            answer_mode=self.answer_mode,
            retriever_mode=self.retriever_mode,
            duration_ms=elapsed_ms(load_start),
        )

    def _load_pdf_with_pymupdf(self, pdf_bytes: bytes, filename: str) -> List[Document]:
        """Fast in-memory parsing using C-native PyMuPDF (pymupdf)."""
        docs = []
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")

        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text("text")
            if text.strip():
                docs.append(
                    Document(
                        page_content=text,
                        metadata={"source": filename, "page": page_num + 1},
                    )
                )
        doc.close()
        del doc
        gc.collect()
        return docs

    def get_chunker(
        self,
        strategy: str,
        llm_model: str | None = None,
        user_credit_balance: int | None = None,
        estimated_credits: int | None = None,
    ):
        from langchain_text_splitters import (
            CharacterTextSplitter,
            RecursiveCharacterTextSplitter,
            TokenTextSplitter,
        )

        if strategy == "fixed":
            return CharacterTextSplitter(
                chunk_size=500, chunk_overlap=50, separator=" "
            )
        elif strategy == "recursive":
            return RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        elif strategy == "token":
            return TokenTextSplitter(chunk_size=500, chunk_overlap=50)
        elif strategy == "semantic":
            return RecursiveCharacterTextSplitter(
                chunk_size=300, chunk_overlap=20, separators=["\n\n", ". ", " "]
            )
        elif strategy == "agentic":
            return AgenticChunkSplitter(
                llm=self.get_llm(llm_model),
                max_llm_calls=40,
                user_credit_balance=user_credit_balance,
                estimated_credits=estimated_credits,
            )
        raise ValueError(f"Unknown strategy: {strategy}")

    def get_llm(self, model_name: str | None = None):
        """Factory for LLMs: ChatOllama (Dev) vs ChatOpenAI (Prod)"""
        if APP_ENV == "prod":
            from langchain_openai import ChatOpenAI

            target_model = model_name or PROD_LLM_MODEL_1
            return ChatOpenAI(
                model=target_model,
                api_key=OPENAI_API_KEY,
                temperature=0.0,
                timeout=45,
                max_retries=1,
            )
        else:
            from langchain_ollama import ChatOllama

            target_model = model_name or DEV_LLM_MODEL_1
            return ChatOllama(
                model=target_model,
                base_url=OLLAMA_BASE_URL,
                temperature=0.0,
                num_predict=1024,  # Increased token limit to allow LLM/RAGAS evaluations to complete without truncation
            )

    def get_embedding_model(self, model_name: str | None = None):
        """Factory for Embeddings: Ollama Embeddings (Dev) vs OpenAI Embeddings (Prod)"""
        if APP_ENV == "prod":
            from langchain_openai import OpenAIEmbeddings

            target_model = model_name or PROD_EMBED_MODEL_1
            return OpenAIEmbeddings(model=target_model, api_key=OPENAI_API_KEY)
        else:
            from langchain_ollama import OllamaEmbeddings

            target_model = model_name or DEV_EMBED_MODEL_1
            return OllamaEmbeddings(model=target_model, base_url=OLLAMA_BASE_URL)

    def build_vector_store(self, chunks: List, embedding_fn, collection_name: str):
        """Factory for Vector Database: In-memory Chroma (Dev) vs PGVector (Prod)"""
        if APP_ENV == "prod":
            if PROD_VECTOR_DB == "pg-vector":
                from langchain_postgres.vectorstores import PGVector

                if not DATABASE_URL:
                    raise ValueError(
                        "DATABASE_URL must be configured for PGVector in production."
                    )

                return PGVector.from_documents(
                    embedding=embedding_fn,
                    documents=chunks,
                    collection_name=collection_name,
                    connection=DATABASE_URL,
                )
            else:
                from langchain_community.vectorstores import Chroma

                return Chroma.from_documents(chunks, embedding_fn)
        else:
            from langchain_community.vectorstores import Chroma

            return Chroma.from_documents(chunks, embedding_fn)

    @staticmethod
    def _evaluation_query_terms() -> set[str]:
        query_text = " ".join(item["question"] for item in DEFAULT_TEST_DATASET)
        terms = set()
        for token in re.findall(r"[a-zA-Z0-9][a-zA-Z0-9_.-]*", query_text.lower()):
            if len(token) >= 3 and token not in QUERY_STOPWORDS:
                terms.add(token)
        return terms

    @classmethod
    def _score_chunk_for_evaluation(cls, text: str, query_terms: set[str]) -> int:
        text_lower = text.lower()
        return sum(text_lower.count(term) for term in query_terms)

    def _prefilter_chunks_for_evaluation(
        self, chunks: List[Document]
    ) -> List[Document]:
        if not EVALUATION_FAST_INDEX or len(chunks) <= EVALUATION_MAX_INDEX_CHUNKS:
            return chunks

        query_terms = self._evaluation_query_terms()
        if not query_terms:
            return chunks[:EVALUATION_MAX_INDEX_CHUNKS]

        scored_chunks = [
            (
                self._score_chunk_for_evaluation(chunk.page_content, query_terms),
                index,
                chunk,
            )
            for index, chunk in enumerate(chunks)
        ]
        scored_chunks.sort(key=lambda item: (-item[0], item[1]))

        target_size = max(EVALUATION_MIN_INDEX_CHUNKS, EVALUATION_MAX_INDEX_CHUNKS)
        selected = scored_chunks[:target_size]

        if selected and selected[0][0] == 0:
            selected_chunks = chunks[:target_size]
        else:
            selected_chunks = [
                chunk for _, _, chunk in sorted(selected, key=lambda item: item[1])
            ]

        emit_eval_log(
            "index_prefilter",
            original_chunks=len(chunks),
            indexed_chunks=len(selected_chunks),
            max_score=selected[0][0] if selected else 0,
            terms=len(query_terms),
        )
        return selected_chunks

    def get_retriever_for_config(
        self,
        chunk_strat: str,
        embed_model: str,
        llm_model: str | None = None,
        user_credit_balance: int | None = None,
        estimated_credits: int | None = None,
    ) -> Tuple[Any, Any]:
        """Builds and indexes the vector store once per (chunker, embed_model) pair."""
        stage_start = time.perf_counter()
        cache_key = (chunk_strat, embed_model)
        if cache_key in self._retriever_cache:
            emit_eval_log(
                "retriever_cache_hit",
                strategy=chunk_strat,
                embedding=embed_model,
                duration_ms=elapsed_ms(stage_start),
            )
            return self._retriever_cache[cache_key]

        split_start = time.perf_counter()
        chunker = self.get_chunker(
            chunk_strat,
            llm_model=llm_model,
            user_credit_balance=user_credit_balance,
            estimated_credits=estimated_credits,
        )
        chunks = chunker.split_documents(self.raw_docs)
        split_ms = elapsed_ms(split_start)
        chunks = self._prefilter_chunks_for_evaluation(chunks)

        if self.retriever_mode == "fast":
            retriever = LexicalChunkRetriever(chunks, k=3)
            self._retriever_cache[cache_key] = (retriever, None)
            emit_eval_log(
                "retriever_ready",
                strategy=chunk_strat,
                embedding=embed_model,
                retriever_mode=self.retriever_mode,
                indexed_chunks=len(chunks),
                split_ms=split_ms,
                index_ms=0,
                total_ms=elapsed_ms(stage_start),
            )
            return retriever, None

        embed_fn = self.get_embedding_model(embed_model)

        safe_strat = sanitize_namespace(chunk_strat)
        safe_embed = sanitize_namespace(embed_model)
        collection_id = f"{safe_strat}-{safe_embed}"

        index_start = time.perf_counter()
        vector_store = self.build_vector_store(chunks, embed_fn, collection_id)
        index_ms = elapsed_ms(index_start)
        retriever = vector_store.as_retriever(search_kwargs={"k": 3})
        self._retriever_cache[cache_key] = (retriever, embed_fn)
        emit_eval_log(
            "retriever_ready",
            strategy=chunk_strat,
            embedding=embed_model,
            retriever_mode=self.retriever_mode,
            indexed_chunks=len(chunks),
            split_ms=split_ms,
            index_ms=index_ms,
            total_ms=elapsed_ms(stage_start),
        )
        return retriever, embed_fn

    @staticmethod
    def _trim_context(text: str) -> str:
        """Keep evaluation prompts compact while preserving each retrieved hit."""
        if len(text) <= EVALUATION_CONTEXT_CHARS_PER_DOC:
            return text
        return text[:EVALUATION_CONTEXT_CHARS_PER_DOC].rsplit(" ", 1)[0].strip()

    @staticmethod
    def _extract_answer_from_context(question: str, context_texts: List[str]) -> str:
        question_terms = tokenize_for_metric(question)
        sentences = []
        for text in context_texts:
            sentences.extend(
                sentence.strip()
                for sentence in re.split(r"(?<=[.!?])\s+", text)
                if sentence.strip()
            )

        if not sentences:
            return "No context found"

        best_sentence = max(
            sentences,
            key=lambda sentence: overlap_ratio(
                question_terms, tokenize_for_metric(sentence)
            ),
        )
        return best_sentence[:500]

    def _answer_question(self, retriever: Any, llm_instance: Any, question: str):
        question_start = time.perf_counter()
        retrieve_start = time.perf_counter()
        retrieved_docs = retriever.invoke(question)
        retrieve_ms = elapsed_ms(retrieve_start)
        if not retrieved_docs:
            emit_eval_log(
                "question_answered",
                question=repr(question[:80]),
                contexts=0,
                retrieval_ms=retrieve_ms,
                generation_ms=0,
                total_ms=elapsed_ms(question_start),
            )
            return "No context found", ["No context found"]

        retrieved_texts = [
            self._trim_context(doc.page_content)
            for doc in retrieved_docs
            if doc.page_content.strip()
        ]
        if not retrieved_texts:
            emit_eval_log(
                "question_answered",
                question=repr(question[:80]),
                contexts=0,
                retrieval_ms=retrieve_ms,
                generation_ms=0,
                total_ms=elapsed_ms(question_start),
            )
            return "No context found", ["No context found"]

        if self.answer_mode == "extractive" or llm_instance is None:
            gen_text = self._extract_answer_from_context(question, retrieved_texts)
            emit_eval_log(
                "question_answered",
                question=repr(question[:80]),
                mode="extractive",
                contexts=len(retrieved_texts),
                context_chars=sum(len(text) for text in retrieved_texts),
                retrieval_ms=retrieve_ms,
                generation_ms=0,
                total_ms=elapsed_ms(question_start),
            )
            return gen_text, retrieved_texts

        context_str = "\n\n".join(retrieved_texts)
        prompt = (
            f"Context:\n{context_str}\n\n"
            f"Question: {question}\n\n"
            "Answer in one concise sentence using only the context."
        )

        try:
            generation_start = time.perf_counter()
            response = llm_instance.invoke(prompt)
            generation_ms = elapsed_ms(generation_start)
            gen_text = (
                response.content if hasattr(response, "content") else str(response)
            )
            emit_eval_log(
                "question_answered",
                question=repr(question[:80]),
                mode="llm",
                contexts=len(retrieved_texts),
                context_chars=len(context_str),
                retrieval_ms=retrieve_ms,
                generation_ms=generation_ms,
                total_ms=elapsed_ms(question_start),
            )
            return gen_text, retrieved_texts
        except Exception as gen_err:
            emit_eval_log(
                "question_failed",
                question=repr(question[:80]),
                contexts=len(retrieved_texts),
                context_chars=len(context_str),
                retrieval_ms=retrieve_ms,
                total_ms=elapsed_ms(question_start),
                error=repr(str(gen_err)),
            )
            return f"Generation error: {str(gen_err)}", retrieved_texts

    @staticmethod
    def _compute_fast_metrics(
        questions: List[str],
        answers: List[str],
        contexts: List[List[str]],
        ground_truths: List[str],
    ) -> Dict[str, float]:
        faithfulness_scores = []
        relevancy_scores = []
        precision_scores = []
        recall_scores = []

        for question, answer, context_items, ground_truth in zip(
            questions, answers, contexts, ground_truths
        ):
            context_text = " ".join(context_items)
            answer_terms = tokenize_for_metric(answer)
            question_terms = tokenize_for_metric(question)
            context_terms = tokenize_for_metric(context_text)
            ground_truth_terms = tokenize_for_metric(ground_truth)
            relevant_terms = question_terms | ground_truth_terms

            faithfulness_scores.append(overlap_ratio(answer_terms, context_terms))
            relevancy_scores.append(
                max(
                    overlap_ratio(ground_truth_terms, answer_terms),
                    overlap_ratio(answer_terms, ground_truth_terms),
                )
            )
            recall_scores.append(overlap_ratio(ground_truth_terms, context_terms))

            context_coverage = overlap_ratio(relevant_terms, context_terms)
            context_size_penalty = min(1.0, 4500 / max(len(context_text), 1))
            precision_scores.append(context_coverage * context_size_penalty)

        def average(values: List[float]) -> float:
            if not values:
                return 0.0
            return round(sum(values) / len(values), 4)

        return {
            "faithfulness": average(faithfulness_scores),
            "answer_relevancy": average(relevancy_scores),
            "context_precision": average(precision_scores),
            "context_recall": average(recall_scores),
        }

    def evaluate_retriever_with_llm(
        self,
        retriever: Any,
        embed_fn: Any,
        chunk_strat: str,
        embed_model: str,
        llm_model: str,
        vector_db: str | None = None,
        test_dataset: List[Dict] | None = None,
    ) -> Dict[str, Any]:
        """Reuses an existing retriever to run LLM answer generation and RAGAS evaluation."""
        if vector_db is None:
            vector_db = PROD_VECTOR_DB if APP_ENV == "prod" else DEV_VECTOR_DB

        if test_dataset is None:
            test_dataset = DEFAULT_TEST_DATASET

        start_time = time.perf_counter()

        questions = [item["question"] for item in test_dataset]
        raw_ground_truths = [item["ground_truth"] for item in test_dataset]

        ground_truths_list = [
            gt if isinstance(gt, list) else [gt] for gt in raw_ground_truths
        ]
        ground_truth_single = [
            gt[0] if isinstance(gt, list) and len(gt) > 0 else str(gt)
            for gt in raw_ground_truths
        ]

        llm_instance = self.get_llm(llm_model) if self.answer_mode == "llm" else None

        answer_start = time.perf_counter()
        worker_count = EVALUATION_ANSWER_WORKERS
        if worker_count == 1:
            answer_context_pairs = [
                self._answer_question(retriever, llm_instance, q) for q in questions
            ]
        else:
            with ThreadPoolExecutor(max_workers=worker_count) as executor:
                answer_context_pairs = list(
                    executor.map(
                        lambda q: self._answer_question(retriever, llm_instance, q),
                        questions,
                    )
                )

        answers = [answer for answer, _ in answer_context_pairs]
        contexts = [context for _, context in answer_context_pairs]
        answer_generation_ms = elapsed_ms(answer_start)
        emit_eval_log(
            "answers_ready",
            llm=llm_model,
            answer_mode=self.answer_mode,
            questions=len(questions),
            workers=worker_count,
            duration_ms=answer_generation_ms,
        )

        latency = elapsed_ms(start_time)

        if self.metric_mode == "ragas":
            from datasets import Dataset
            from ragas import evaluate
            from ragas.embeddings import LangchainEmbeddingsWrapper
            from ragas.llms import LangchainLLMWrapper
            from ragas.metrics import (
                answer_relevancy,
                context_precision,
                context_recall,
                faithfulness,
            )

            if llm_instance is None:
                llm_instance = self.get_llm(llm_model)
            if embed_fn is None:
                embed_fn = self.get_embedding_model(embed_model)

            # Map fields for Ragas 0.2+ backward & forward compatibility
            dataset = Dataset.from_dict(
                {
                    "question": questions,
                    "user_input": questions,
                    "answer": answers,
                    "response": answers,
                    "contexts": contexts,
                    "retrieved_contexts": contexts,
                    "ground_truth": ground_truth_single,
                    "ground_truths": ground_truths_list,
                    "reference": ground_truth_single,
                }
            )

            evaluator_llm = LangchainLLMWrapper(llm_instance)
            evaluator_embeddings = LangchainEmbeddingsWrapper(embed_fn)

            run_config = RunConfig(
                max_workers=EVALUATION_RAGAS_WORKERS,
                timeout=EVALUATION_RAGAS_TIMEOUT,
                max_retries=EVALUATION_RAGAS_RETRIES,
                max_wait=10,
            )

            metric_start = time.perf_counter()
            ragas_result = evaluate(
                dataset=dataset,
                metrics=[
                    faithfulness,
                    answer_relevancy,
                    context_precision,
                    context_recall,
                ],
                llm=evaluator_llm,
                embeddings=evaluator_embeddings,
                run_config=run_config,
            )
            metric_ms = elapsed_ms(metric_start)
            total_ms = elapsed_ms(start_time)
            emit_eval_log(
                "ragas_complete",
                llm=llm_model,
                questions=len(questions),
                metrics=4,
                workers=EVALUATION_RAGAS_WORKERS,
                ragas_ms=metric_ms,
                total_ms=total_ms,
            )

            raw_scores: Dict[str, float] = {}

            if hasattr(ragas_result, "to_pandas"):
                df = ragas_result.to_pandas()
                raw_scores = df.mean(numeric_only=True).to_dict()
            elif hasattr(ragas_result, "scores"):
                scores_obj = ragas_result.scores
                if isinstance(scores_obj, list):
                    metric_sums: Dict[str, float] = {}
                    metric_counts: Dict[str, int] = {}
                    for item in scores_obj:
                        if isinstance(item, dict):
                            for k, v in item.items():
                                try:
                                    float_val = float(v)
                                    if not math.isnan(float_val):
                                        metric_sums[k] = (
                                            metric_sums.get(k, 0.0) + float_val
                                        )
                                        metric_counts[k] = metric_counts.get(k, 0) + 1
                                except (ValueError, TypeError):
                                    pass
                    raw_scores = {
                        k: metric_sums[k] / metric_counts[k]
                        for k in metric_sums
                        if metric_counts[k] > 0
                    }
                elif isinstance(scores_obj, dict):
                    raw_scores = scores_obj
            elif isinstance(ragas_result, dict):
                raw_scores = ragas_result

            cleaned_metrics = {}
            for k, v in raw_scores.items():
                try:
                    val = float(v)
                    cleaned_metrics[k] = 0.0 if math.isnan(val) else round(val, 4)
                except (ValueError, TypeError):
                    cleaned_metrics[k] = 0.0
        else:
            metric_start = time.perf_counter()
            cleaned_metrics = self._compute_fast_metrics(
                questions=questions,
                answers=answers,
                contexts=contexts,
                ground_truths=ground_truth_single,
            )
            metric_ms = elapsed_ms(metric_start)
            total_ms = elapsed_ms(start_time)
            emit_eval_log(
                "fast_metrics_complete",
                questions=len(questions),
                metrics=4,
                metric_ms=metric_ms,
                total_ms=total_ms,
            )

        gc.collect()

        return {
            "environment": APP_ENV,
            "vector_db": vector_db,
            "chunking_strategy": chunk_strat,
            "embedding_model": embed_model,
            "llm_model": llm_model,
            "latency_ms": latency,
            "metric_mode": self.metric_mode,
            "answer_mode": self.answer_mode,
            "retriever_mode": self.retriever_mode,
            "timings_ms": {
                "answer_generation": answer_generation_ms,
                "metric_evaluation": metric_ms,
                "total": total_ms,
            },
            "metrics": cleaned_metrics,
        }
