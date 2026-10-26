import { useEffect, useMemo, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';

import { AlertCircle, FileText, RefreshCw, UploadCloud } from 'lucide-react';

import { type PipelineResult } from '../types/evaluation';

import { LoadingSpinner } from '../components/LoadingSpinner';

import { getTopConfig } from '@/utils/dashboard';

import { useProcessingStore } from '../store/processing-store';

import { useDashboardResults } from '@/features/dashboard/hooks/useDashboardResults';

import { useEvaluationJobStatus } from '@/features/dashboard/hooks/useEvaluationJobStatus';

import useAuthStore from '@/store/store';

import { DashboardHeader } from '@/features/dashboard/components/DashboardHeader';

import { EvaluationProgress } from '@/features/dashboard/components/EvaluationProgress';

import { MetricCards } from '@/features/dashboard/components/MetricCards';

import { ViewSwitcher } from '@/features/dashboard/components/ViewSwitcher';

import { BenchmarkChart } from '@/features/dashboard/components/BenchmarkChart';

import { MatrixTable } from '@/features/dashboard/components/MatrixTable';


type DashboardState = {
	results?: PipelineResult[] | PipelineResult;
	fileName?: string;
	fileSize?: string;
};

export default function Dashboard() {
	const location = useLocation();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const fileState = (location.state as DashboardState | null) ?? null;

	const fileResults = fileState?.results;

	const {
		jobId,
		isProcessing,
		fileName: processingFileName,
		fileSize: processingFileSize,
		totalRuns: processingTotalRuns,
		startedAt,
		estimatedSeconds,
		statusSteps,
		cancelCurrentEvaluation,
		finishProcessing,
	} = useProcessingStore();

	const [activeTab, setActiveTab] = useState<'chart' | 'table'>('chart');

	const [elapsedSeconds, setElapsedSeconds] = useState(0);

	const fetchBalance = useAuthStore((state) => state.fetchBalance);

	// Normalize router state results.
	// These are only used as fallback/initial data.
	const routerResults = useMemo(() => {
		if (!fileResults) {
			return null;
		}

		return Array.isArray(fileResults) ? fileResults : [fileResults];
	}, [fileResults]);

	// Poll specific job status when a jobId exists.
	const { data: jobData, isLoading: isJobLoading } = useEvaluationJobStatus({
		jobId: isProcessing ? jobId : null,

		onSuccess: () => {
			finishProcessing();
			void fetchBalance();

			// The evaluation has completed.
			// Mark the matrix-results query as stale so it
			// immediately fetches the latest database results.
			void queryClient.invalidateQueries({
				queryKey: ['evaluation', 'matrix-results'],
			});
		},

		onError: (err) => {
			console.error('Job failed:', err);
		},
	});

	// Timer effect for background progress tracking.
	useEffect(() => {
		if (!isProcessing || !startedAt) {
			return;
		}

		const updateElapsed = () => {
			const nextSeconds = Math.max(
				0,
				Math.floor((Date.now() - startedAt) / 1000),
			);

			setElapsedSeconds((prev) => (prev !== nextSeconds ? nextSeconds : prev));
		};

		updateElapsed();

		const interval = window.setInterval(updateElapsed, 1000);

		return () => {
			window.clearInterval(interval);
		};
	}, [isProcessing, startedAt]);

	// Fetch the latest dashboard results.
	//
	// Router results are only fallback/initial data.
	// Once the API responds, dashboardData becomes the
	// source of truth.
	const {
		data: dashboardData,
		isLoading: isDashboardLoading,
		isFetching: isDashboardFetching,
		isError,
		error: queryError,
		refetch,
	} = useDashboardResults({
		enabled: !isProcessing,
		fallbackData: routerResults ?? [],
	});

	// Derive the current dataset.
	//
	// IMPORTANT:
	// dashboardData has priority over routerResults.
	// This allows "Refresh Matrix" to replace the old
	// router-state results with fresh API results.
	const safeData = useMemo(() => {
		if (Array.isArray(dashboardData) && dashboardData.length > 0) {
			return dashboardData;
		}

		if (jobData?.results && jobData.results.length > 0) {
			return jobData.results;
		}

		if (routerResults) {
			return routerResults;
		}

		return [];
	}, [dashboardData, jobData, routerResults]);

	// Also complete processing if data becomes available
	// through router state or job polling.
	useEffect(() => {
		if (isProcessing && safeData.length > 0) {
			finishProcessing();
			void fetchBalance();

			void queryClient.invalidateQueries({
				queryKey: ['evaluation', 'matrix-results'],
			});
		}
	}, [
		isProcessing,
		safeData.length,
		finishProcessing,
		fetchBalance,
		queryClient,
	]);

	const loading = (isDashboardLoading || isJobLoading) && safeData.length === 0;

	const error = useMemo(() => {
		if (jobData?.status === 'failed') {
			return jobData.error || 'Evaluation job failed.';
		}

		if (isError && queryError) {
			return queryError instanceof Error
				? queryError.message
				: 'No benchmark results available yet.';
		}

		if (!isError && !fileResults && safeData.length === 0) {
			return 'No benchmark results available yet.';
		}

		return null;
	}, [isError, queryError, fileResults, safeData.length, jobData]);

	const topConfig = getTopConfig(safeData);

	const activeFileName = fileState?.fileName ?? processingFileName;

	const activeFileSize = fileState?.fileSize ?? processingFileSize;

	const activeRuns = processingTotalRuns ?? 0;

	const stepCount = statusSteps?.length ?? 0;

	const estimatedDuration = Math.max(estimatedSeconds ?? 20, 20);

	const progressPercent = useMemo(() => {
		if (!statusSteps || statusSteps.length === 0) {
			return 10;
		}

		if (elapsedSeconds <= 0) {
			return 8;
		}

		const ratio = Math.min(1, elapsedSeconds / Math.max(estimatedDuration, 1));

		return Math.min(100, Math.max(8, ratio * 100));
	}, [elapsedSeconds, estimatedDuration, statusSteps]);

	const activeStepLabel = useMemo(() => {
		if (!statusSteps || statusSteps.length === 0) {
			return 'Preparing evaluation';
		}

		if (elapsedSeconds <= 0) {
			return 'Starting evaluation';
		}

		if (elapsedSeconds < estimatedDuration * 0.25) {
			return statusSteps[0] ?? 'Preparing document and validation';
		}

		if (elapsedSeconds < estimatedDuration * 0.55) {
			return statusSteps[1] ?? 'Chunking and indexing the document';
		}

		if (elapsedSeconds < estimatedDuration * 0.8) {
			return (
				statusSteps[2] ?? 'Building retrievers and running benchmark checks'
			);
		}

		return (
			statusSteps[Math.min(stepCount - 1, 3)] ??
			'Finalizing the results summary'
		);
	}, [elapsedSeconds, estimatedDuration, statusSteps, stepCount]);

	const estimatedTimeLeft = useMemo(() => {
		if (!estimatedSeconds) {
			return null;
		}

		if (elapsedSeconds >= estimatedSeconds) {
			return null;
		}

		return Math.max(0, estimatedSeconds - elapsedSeconds);
	}, [elapsedSeconds, estimatedSeconds]);

	const formatDuration = (seconds: number) => {
		const safeSeconds = Math.max(0, seconds);

		const minutes = Math.floor(safeSeconds / 60);

		const secs = safeSeconds % 60;

		return `${minutes}:${secs.toString().padStart(2, '0')}`;
	};

	const handleRefresh = async () => {
		try {
			await refetch();
		} catch (error) {
			console.error('Failed to refresh matrix results:', error);
		}
	};

	const handleCancelEvaluation = () => {
		cancelCurrentEvaluation();

		navigate('/', {
			replace: true,
		});
	};

	return (
		<div className="min-h-[calc(100vh-4rem)] w-full bg-zinc-50/50 dark:bg-zinc-950/50">
			<div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
				<DashboardHeader
					loading={loading || isProcessing || isDashboardFetching}
					onRefresh={handleRefresh}
					onUploadNew={() => navigate('/')}
				/>

				{activeFileName && (
					<div className="flex items-center gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-xs text-indigo-600 shadow-sm transition-all sm:text-sm dark:text-indigo-400">
						<FileText className="h-4 w-4 shrink-0" />

						<span>
							Active Document: <strong>{activeFileName}</strong> (
							{activeFileSize})
						</span>
					</div>
				)}

				{isProcessing && (
					<EvaluationProgress
						isProcessing={isProcessing}
						activeRuns={activeRuns}
						activeStepLabel={activeStepLabel}
						elapsedSeconds={elapsedSeconds}
						estimatedTimeLeft={estimatedTimeLeft}
						progressPercent={progressPercent}
						statusSteps={statusSteps}
						onCancel={handleCancelEvaluation}
						formatDuration={formatDuration}
					/>
				)}

				<MetricCards
					data={safeData}
					loading={loading && safeData.length === 0}
					topConfig={topConfig}
				/>

				<div className="space-y-6 pt-2">
					<ViewSwitcher
						activeTab={activeTab}
						onChangeTab={setActiveTab}
					/>

					{loading ? (
						<div className="flex flex-col items-center justify-center space-y-3 rounded-xl border border-zinc-200/80 bg-white py-20 text-center shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900">
							<LoadingSpinner label="Fetching benchmark matrix evaluation..." />

							<p className="max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
								We are generating evaluation scores for your vector embeddings
								and chunking strategies.
							</p>
						</div>
					) : isProcessing && safeData.length === 0 ? (
						<div className="flex flex-col items-center justify-center space-y-4 rounded-xl border border-dashed border-amber-300 bg-white p-12 text-center shadow-sm dark:border-amber-800/50 dark:bg-zinc-900">
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
								<RefreshCw className="h-6 w-6 animate-spin" />
							</div>

							<div className="max-w-md space-y-1">
								<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
									Evaluation Job In Progress
								</h3>

								<p className="text-sm text-zinc-500 dark:text-zinc-400">
									Your document is currently being evaluated across vector
									configurations. The metrics chart and matrix table will
									populate automatically once completed.
								</p>
							</div>
						</div>
					) : safeData.length === 0 ? (
						<div className="flex flex-col items-center justify-center space-y-4 rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center shadow-sm sm:p-12 dark:border-zinc-800 dark:bg-zinc-900">
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
								<UploadCloud className="h-6 w-6" />
							</div>

							<div className="max-w-md space-y-1">
								<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
									No Benchmark Data Available
								</h3>

								<p className="text-sm text-zinc-500 dark:text-zinc-400">
									{error ||
										'Upload a document on the home page to run your first evaluation and generate matrix benchmark analytics.'}
								</p>
							</div>

							<button
								onClick={() => navigate('/')}
								className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
							>
								<UploadCloud className="h-4 w-4" />
								Upload Document to Get Started
							</button>
						</div>
					) : error && !isProcessing ? (
						<div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-red-600 shadow-sm dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
							<AlertCircle className="h-5 w-5 shrink-0" />

							<p className="text-sm font-medium">{error}</p>
						</div>
					) : activeTab === 'chart' ? (
						<div className="rounded-xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900">
							<BenchmarkChart data={safeData} />
						</div>
					) : (
						<div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900">
							<MatrixTable data={safeData} />
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
