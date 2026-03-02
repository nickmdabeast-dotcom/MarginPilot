import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

const navLinks = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Jobs", href: "/jobs" },
  { label: "Customers", href: "/customers" },
  { label: "Reports", href: "/reports" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-900/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-6">
        <Logo href="/" size="sm" variant="dark" />

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-1.5 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right slot — placeholder for future avatar/auth */}
        <div className="h-8 w-8 rounded-full bg-white/10" />
      </div>
    </header>
  );
}
