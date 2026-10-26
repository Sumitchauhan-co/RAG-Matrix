import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	Coins,
	CreditCard,
	Galaxy,
	Home,
	LayoutDashboard,
	Loader2,
	Menu,
	X,
} from 'lucide-react';
import { ModeToggle } from './mode-toggle';
import useAuthStore from '../store/store';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover';
import { formatMemberSinceDate } from '../utils/date';
import { SignOutButton } from '@/features/auth/components/SignoutButton';
import { NotificationCenter } from '@/features/notifications/components/NotificationCenter';

const navItems = [
	{ name: 'Home', path: '/', icon: Home },
	{ name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
	{ name: 'Payment', path: '/payment', icon: CreditCard },
];

export const Navbar: React.FC = () => {
	const navigate = useNavigate();
	const { isAuthenticated, user, creditBalance, fetchBalance } = useAuthStore();
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		if (isAuthenticated) {
			void fetchBalance();
		}
	}, [isAuthenticated, fetchBalance]);

	const handleHomeClick = useCallback(() => {
		navigate('/');
		setIsOpen(false);
	}, [navigate]);

	const handleSignInClick = useCallback(() => {
		navigate('/signin');
		setIsOpen(false);
	}, [navigate]);

	const handlePaymentClick = useCallback(() => {
		navigate('/payment');
		setIsOpen(false);
	}, [navigate]);

	const handleNavClick = useCallback(
		(path: string) => {
			navigate(path);
			setIsOpen(false);
		},
		[navigate],
	);

	const userInitial = (user?.full_name || user?.email || 'U')
		.charAt(0)
		.toUpperCase();

	const createdAtFormatted = formatMemberSinceDate(user?.created_at);

	return (
		<header className="sticky top-0 z-50 w-full">
			<div className="relative mx-auto w-full max-w-7xl px-4 py-2">
				<nav className="relative z-50 flex w-full items-center justify-between rounded-full border border-zinc-200/80 bg-white/75 px-4 py-2.5 shadow-md backdrop-blur-md transition-colors dark:border-zinc-800/80 dark:bg-zinc-950/75 md:px-6">
					{/* Brand / Logo */}
					<button
						onClick={handleHomeClick}
						className="group flex items-center gap-2 text-base font-bold text-zinc-900 transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-100 dark:hover:text-indigo-400 sm:text-lg"
						aria-label="RAG Benchmark Home"
					>
						<Galaxy className="h-5 w-5 text-indigo-500 transition-transform duration-300 ease-out group-hover:rotate-180 dark:text-indigo-400 sm:h-6 sm:w-6" />
						<span className="tracking-tight">RAG Matrix</span>
					</button>

					{/* Desktop Navigation Links */}
					<div className="hidden items-center gap-2 rounded-full border border-zinc-200/60 bg-zinc-100/40 px-3 py-1.5 dark:border-zinc-800/60 dark:bg-zinc-900/40 md:flex">
						{navItems.map((item) => {
							const Icon = item.icon;
							return (
								<button
									key={item.name}
									onClick={() => handleNavClick(item.path)}
									className="group relative flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-zinc-600 transition-colors hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400"
								>
									<Icon className="h-4 w-4" />
									<span>{item.name}</span>
									<span className="absolute bottom-0 left-1/2 h-0.5 w-0 -translate-x-1/2 bg-indigo-600 transition-all duration-300 ease-out group-hover:w-4/5 dark:bg-indigo-400" />
								</button>
							);
						})}
					</div>

					{/* Desktop Right Actions */}
					<div className="hidden items-center gap-3 md:flex">
						{isAuthenticated && (
							<button
								onClick={handlePaymentClick}
								className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
									(creditBalance ?? 0) <= 50
										? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
										: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300'
								}`}
							>
								<Coins className="h-3.5 w-3.5" />
								{creditBalance !== null ? (
									<>{creditBalance} credits</>
								) : (
									<Loader2 className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400" />
								)}
							</button>
						)}

						<ModeToggle />

						{/* Profile Popover / Sign In */}
						{isAuthenticated ? (
							<Popover>
								<PopoverTrigger
									className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
									aria-label="User menu"
								>
									<Avatar className="h-9 w-9 border border-zinc-200 bg-indigo-50 transition-colors hover:border-indigo-500/50 dark:border-zinc-800 dark:bg-indigo-950/50">
										<AvatarFallback className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
											{userInitial}
										</AvatarFallback>
									</Avatar>
								</PopoverTrigger>

								<PopoverContent
									align="end"
									className="w-64 space-y-1.5 rounded-xl border border-zinc-200/80 bg-white/95 p-2.5 shadow-xl backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-900/95"
								>
									<div className="flex items-center gap-2.5 border-b border-zinc-100 pb-2 dark:border-zinc-800/80">
										<Avatar className="h-9 w-9 shrink-0 bg-indigo-100 dark:bg-indigo-900/40">
											<AvatarFallback className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
												{userInitial}
											</AvatarFallback>
										</Avatar>
										<div className="flex min-w-0 flex-col">
											<p className="truncate text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
												{user?.full_name || 'User Profile'}
											</p>
											<p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
												{user?.email}
											</p>
										</div>
									</div>

									<div className="w-full">
										<SignOutButton />
									</div>

									{createdAtFormatted && (
										<div className="border-t border-zinc-100 pt-1 text-center text-[11px] text-zinc-400 dark:border-zinc-800/80 dark:text-zinc-500">
											Member since {createdAtFormatted}
										</div>
									)}
								</PopoverContent>
							</Popover>
						) : (
							<Button
								onClick={handleSignInClick}
								className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
							>
								Sign In
							</Button>
						)}
						{isAuthenticated && <NotificationCenter />}
					</div>

					{/* Mobile Right Controls */}
					<div className="flex items-center gap-2 md:hidden">
						<ModeToggle />
						<button
							onClick={() => setIsOpen(!isOpen)}
							aria-label="Toggle Menu"
							aria-expanded={isOpen}
							className="cursor-pointer rounded-full p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
						>
							{isOpen ? (
								<X className="h-5 w-5" />
							) : (
								<Menu className="h-5 w-5" />
							)}
						</button>
						{isAuthenticated && <NotificationCenter />}
					</div>
				</nav>

				{/* Mobile Dropdown Menu */}
				{isOpen && (
					<div className="animate-in fade-in slide-in-from-top-2 absolute left-4 right-4 z-40 mt-2 flex flex-col gap-3 rounded-3xl border border-zinc-200/80 bg-white/95 p-4 shadow-xl backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-900/95 md:hidden">
						<div className="flex flex-col gap-2">
							{navItems.map((item) => {
								const Icon = item.icon;
								return (
									<button
										key={item.name}
										onClick={() => handleNavClick(item.path)}
										className="group relative flex items-center justify-between rounded-2xl border border-zinc-200/80 bg-zinc-100/80 px-4 py-3 text-left text-sm font-semibold text-zinc-800 transition-all duration-200 hover:bg-zinc-200/80 hover:text-indigo-600 active:scale-[0.98] dark:border-zinc-800/80 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800/90 dark:hover:text-indigo-400"
									>
										<div className="flex items-center gap-3">
											<Icon className="h-4 w-4 text-zinc-500 transition-colors group-hover:text-indigo-600 dark:text-zinc-400 dark:group-hover:text-indigo-400" />
											<span>{item.name}</span>
										</div>
									</button>
								);
							})}
						</div>

						<hr className="my-1 border-zinc-200/80 dark:border-zinc-800/80" />

						{isAuthenticated ? (
							<div className="flex flex-col gap-3">
								<div className="flex flex-col gap-2 rounded-2xl border border-zinc-200/60 bg-zinc-50/50 p-3 dark:border-zinc-800/60 dark:bg-zinc-800/30">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2.5 min-w-0">
											<Avatar className="h-9 w-9 shrink-0 bg-indigo-100 dark:bg-indigo-900/40">
												<AvatarFallback className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
													{userInitial}
												</AvatarFallback>
											</Avatar>
											<div className="flex min-w-0 flex-col">
												<span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
													{user?.full_name || 'User Profile'}
												</span>
												{user?.email && (
													<span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
														{user.email}
													</span>
												)}
											</div>
										</div>

										<button
											onClick={handlePaymentClick}
											className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
												(creditBalance ?? 0) <= 50
													? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
													: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300'
											}`}
										>
											<Coins className="h-3 w-3" />
											{creditBalance ?? 0}
										</button>
									</div>

									{createdAtFormatted && (
										<div className="mt-1 border-t border-zinc-200/60 pt-2 text-center text-[11px] text-zinc-400 dark:border-zinc-800/60 dark:text-zinc-500">
											Member since {createdAtFormatted}
										</div>
									)}
								</div>

								<div className="w-full rounded-2xl border border-red-200/80 bg-red-50/70 text-red-600 transition-all active:scale-[0.98] dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400 [&_button]:w-full [&_button]:py-2.5 [&_button]:text-red-600 [&_button]:dark:text-red-400">
									<SignOutButton />
								</div>
							</div>
						) : (
							<Button
								onClick={handleSignInClick}
								className="w-full rounded-2xl bg-indigo-600 py-3 text-center text-sm font-medium text-white shadow-md transition-all active:scale-[0.98] hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
							>
								Sign In
							</Button>
						)}
					</div>
				)}
			</div>
		</header>
	);
};
