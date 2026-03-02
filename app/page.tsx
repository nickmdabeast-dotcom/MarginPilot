"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useScroll,
  useTransform,
  useInView,
  useSpring,
} from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  CheckCircle,
  Clock,
  DollarSign,
  TrendingUp,
  Truck,
  Upload,
  Zap,
  AlertTriangle,
  Target,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/Logo";

// ─── Floating Paths Background ───────────────────────────────────────────────

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg
        className="w-full h-full text-slate-950 dark:text-white"
        viewBox="0 0 696 316"
        fill="none"
      >
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.1 + path.id * 0.03}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{
              pathLength: 1,
              opacity: [0.3, 0.6, 0.3],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
          />
        ))}
      </svg>
    </div>
  );
}

// ─── Pillar Card ──────────────────────────────────────────────────────────────

interface PillarCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
}

function PillarCard({ icon, title, description, delay }: PillarCardProps) {
  return (
    <motion.div
      className="flex flex-col items-center text-center p-6 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 group hover:bg-white/10 transition-all duration-300"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, delay }}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
    >
      <motion.div
        className="text-blue-400 bg-blue-400/10 p-4 rounded-lg mb-4 group-hover:bg-blue-400/20 transition-colors duration-300"
        whileHover={{ rotate: [0, -10, 10, -5, 0], transition: { duration: 0.5 } }}
      >
        {icon}
      </motion.div>
      <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-blue-300 transition-colors duration-300">
        {title}
      </h3>
      <p className="text-gray-300 leading-relaxed">{description}</p>
    </motion.div>
  );
}

// ─── Stat Counter ─────────────────────────────────────────────────────────────

interface StatCounterProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
  delay: number;
}

function StatCounter({ icon, value, label, prefix = "", suffix = "", delay }: StatCounterProps) {
  const countRef = useRef(null);
  const isInView = useInView(countRef, { once: false });
  const [hasAnimated, setHasAnimated] = useState(false);

  const springValue = useSpring(0, { stiffness: 50, damping: 10 });

  useEffect(() => {
    if (isInView && !hasAnimated) {
      springValue.set(value);
      setHasAnimated(true);
    } else if (!isInView && hasAnimated) {
      springValue.set(0);
      setHasAnimated(false);
    }
  }, [isInView, value, springValue, hasAnimated]);

  const displayValue = useTransform(springValue, (latest) => Math.floor(latest).toLocaleString());

  return (
    <motion.div
      className="bg-white/5 backdrop-blur-sm p-6 rounded-xl flex flex-col items-center text-center group hover:bg-white/10 transition-colors duration-300 border border-white/10"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, delay }}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
    >
      <motion.div
        className="w-14 h-14 rounded-full bg-blue-400/10 flex items-center justify-center mb-4 text-blue-400 group-hover:bg-blue-400/20 transition-colors duration-300"
        whileHover={{ rotate: 360, transition: { duration: 0.8 } }}
      >
        {icon}
      </motion.div>
      <motion.div ref={countRef} className="text-3xl font-bold text-white flex items-center gap-0.5">
        <span>{prefix}</span>
        <motion.span>{displayValue}</motion.span>
        <span>{suffix}</span>
      </motion.div>
      <p className="text-gray-300 text-sm mt-1">{label}</p>
      <motion.div className="w-10 h-0.5 bg-blue-400 mt-3 group-hover:w-16 transition-all duration-300" />
    </motion.div>
  );
}

// ─── Step Card ────────────────────────────────────────────────────────────────

interface StepCardProps {
  number: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
}

function StepCard({ number, icon, title, description, delay }: StepCardProps) {
  return (
    <motion.div
      className="relative flex flex-col items-center text-center p-6 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 group hover:bg-white/10 transition-all duration-300"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, delay }}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
    >
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">
        Step {number}
      </div>
      <div className="text-purple-400 bg-purple-400/10 p-4 rounded-lg mb-4 mt-2 group-hover:bg-purple-400/20 transition-colors duration-300">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-blue-300 transition-colors duration-300">
        {title}
      </h3>
      <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
    </motion.div>
  );
}

// ─── Marketing Nav ────────────────────────────────────────────────────────────

function MarketingNav() {
  return (
    <nav className="relative z-50 flex items-center justify-between px-6 py-5">
      <motion.div
        className="flex items-center space-x-8"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
      >
        <Logo size="md" variant="dark" />

        <div className="hidden items-center space-x-8 md:flex">
          <a href="#problem" className="text-gray-300 transition-colors hover:text-white text-sm">The Problem</a>
          <a href="#solution" className="text-gray-300 transition-colors hover:text-white text-sm">Solution</a>
          <a href="#how-it-works" className="text-gray-300 transition-colors hover:text-white text-sm">How It Works</a>
          <Link href="/dashboard" className="text-gray-300 transition-colors hover:text-white text-sm">Dashboard</Link>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <Button
          asChild
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
        >
          <a href="#cta" className="flex items-center gap-2">
            Request Analysis
            <ArrowRight className="h-4 w-4" />
          </a>
        </Button>
      </motion.div>
    </nav>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start end", "end start"],
  });

  const y1 = useTransform(scrollYProgress, [0, 1], [0, -50]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, 50]);

  const pillars = [
    {
      icon: <DollarSign className="w-8 h-8" />,
      title: "Revenue Allocation Engine",
      description:
        "Match jobs to technicians based on revenue potential, skill fit, and route efficiency — not just who's closest on the map.",
    },
    {
      icon: <AlertTriangle className="w-8 h-8" />,
      title: "Margin Protection Engine",
      description:
        "Flag overtime risk before dispatch happens. Know which technicians will exceed 8 hours before they leave the lot.",
    },
    {
      icon: <CalendarClock className="w-8 h-8" />,
      title: "Revenue Stability Engine",
      description:
        "Project 30/60/90-day revenue from your current job pipeline. Stop flying blind on monthly targets.",
    },
  ];

  const steps = [
    {
      number: "01",
      icon: <Upload className="w-7 h-7" />,
      title: "Upload Your Schedule",
      description: "Export a CSV from your field service management tool. No integrations required.",
    },
    {
      number: "02",
      icon: <BarChart3 className="w-7 h-7" />,
      title: "Get Per-Truck Metrics",
      description: "Instantly see revenue per technician, per truck, and per field hour.",
    },
    {
      number: "03",
      icon: <Target className="w-7 h-7" />,
      title: "Optimize Dispatch",
      description: "Re-rank jobs using our revenue-weighted scoring formula before the day starts.",
    },
    {
      number: "04",
      icon: <TrendingUp className="w-7 h-7" />,
      title: "Reduce Overtime & Grow",
      description: "Cut unplanned overtime costs and increase revenue extracted per field hour.",
    },
  ];

  const stats = [
    { icon: <Truck className="w-6 h-6" />, value: 18400, label: "Revenue Per Truck / Month", prefix: "$", suffix: "" },
    { icon: <Clock className="w-6 h-6" />, value: 34, label: "Overtime Reduction", prefix: "", suffix: "%" },
    { icon: <DollarSign className="w-6 h-6" />, value: 215, label: "Revenue Per Tech Hour", prefix: "$", suffix: "" },
    { icon: <BarChart3 className="w-6 h-6" />, value: 12000, label: "Jobs Analyzed", prefix: "", suffix: "+" },
  ];

  const problems = [
    {
      icon: <Clock className="w-6 h-6 text-red-400" />,
      text: "Technicians hitting overtime without the revenue to justify it",
    },
    {
      icon: <Truck className="w-6 h-6 text-orange-400" />,
      text: "High-value jobs paired with inefficient routes and wrong technicians",
    },
    {
      icon: <BarChart3 className="w-6 h-6 text-yellow-400" />,
      text: "No per-truck revenue visibility until month-end reconciliation",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>

      {/* Parallax blobs */}
      <motion.div
        className="absolute top-20 left-10 w-64 h-64 rounded-full bg-blue-500/5 blur-3xl"
        style={{ y: y1 }}
      />
      <motion.div
        className="absolute bottom-20 right-10 w-80 h-80 rounded-full bg-purple-500/5 blur-3xl"
        style={{ y: y2 }}
      />

      {/* Nav */}
      <MarketingNav />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative z-10 container mx-auto px-4 pt-20 pb-32">
        <motion.div
          className="text-center max-w-4xl mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        >
          <motion.div
            className="inline-flex items-center px-4 py-2 rounded-full bg-white/5 backdrop-blur-sm mb-8 border border-white/10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Zap className="w-4 h-4 mr-2 text-blue-400" />
            <span className="text-sm font-medium">Revenue Intelligence for HVAC Operators</span>
          </motion.div>

          <motion.h1
            className="text-5xl sm:text-6xl md:text-7xl font-bold mb-8 tracking-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-500 to-blue-400">
              Increase Revenue Per Truck.
            </span>
            <span className="block text-white">Reduce Overtime Chaos.</span>
          </motion.h1>

          <motion.p
            className="text-xl text-gray-300 mb-6 max-w-3xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            Your technicians aren&apos;t the problem. Your schedule is.
          </motion.p>

          <motion.p
            className="text-lg text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.85 }}
          >
            Most HVAC companies optimize marketing spend while leaving field economics
            completely unmanaged. HVAC Revenue OS surfaces exactly where revenue leaks —
            per truck, per tech hour, per day.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.0 }}
          >
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 px-8 py-4 text-lg"
            >
              <a href="#cta" className="flex items-center gap-2">
                Request Operational Analysis
                <ArrowRight className="w-5 h-5" />
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/20 text-white hover:bg-white/10 px-8 py-4 text-lg"
            >
              <a href="#how-it-works" className="flex items-center gap-2">
                See How It Works
              </a>
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Problem ──────────────────────────────────────────────────────── */}
      <section id="problem" className="relative z-10 container mx-auto px-4 py-24">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
              You&apos;re Optimizing
            </span>
            <br />
            <span className="text-white">the Wrong Thing</span>
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            HVAC companies invest heavily in lead generation while leaving money on
            the table every single day through inefficient scheduling, undetected
            overtime risk, and misallocated jobs.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {problems.map((p, i) => (
            <motion.div
              key={i}
              className="flex flex-col items-center text-center p-6 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: i * 0.15 }}
            >
              <div className="mb-4 p-3 rounded-full bg-white/5">{p.icon}</div>
              <p className="text-gray-200 leading-relaxed">{p.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Solution / 3 Pillars ──────────────────────────────────────────── */}
      <section id="solution" className="relative z-10 container mx-auto px-4 py-24">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
              Three Engines.
            </span>
            <br />
            <span className="text-white">One Revenue System.</span>
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            HVAC Revenue OS combines allocation intelligence, margin protection, and
            revenue forecasting into a single operational layer for your field team.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {pillars.map((pillar, index) => (
            <PillarCard key={index} {...pillar} delay={index * 0.2} />
          ))}
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="relative z-10 container mx-auto px-4 py-24">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white">
            From CSV to Clarity
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
              in 60 Seconds
            </span>
          </h2>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            No integrations. No onboarding calls. Upload your schedule export and see
            your field economics immediately.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <StepCard key={index} {...step} delay={index * 0.15} />
          ))}
        </div>
      </section>

      {/* ── Metrics / Stats ───────────────────────────────────────────────── */}
      <section ref={statsRef} className="relative z-10 container mx-auto px-4 py-24">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white">
            The Numbers That Matter
          </h2>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Stop measuring vanity metrics. Start tracking the economics of your field operations.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <StatCounter
              key={index}
              icon={stat.icon}
              value={stat.value}
              label={stat.label}
              prefix={stat.prefix}
              suffix={stat.suffix}
              delay={index * 0.1}
            />
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section id="cta" className="relative z-10 container mx-auto px-4 py-24">
        <motion.div
          className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 backdrop-blur-sm p-12 rounded-2xl border border-white/10 text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.8 }}
        >
          <motion.h3
            className="text-3xl md:text-4xl font-bold mb-4 text-white"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            See What Your Schedule Is
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
              Really Costing You
            </span>
          </motion.h3>
          <motion.p
            className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.35 }}
          >
            Upload a CSV from your FSM. Get your revenue score in 60 seconds.
            No sales call. No credit card.
          </motion.p>
          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 px-8 py-4 text-lg"
            >
              <Link href="/dashboard" className="flex items-center gap-2">
                Get Your Free Revenue Analysis
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
            <div className="flex items-center text-gray-300">
              <CheckCircle className="w-5 h-5 mr-2 text-green-400" />
              <span>No commitment. Results in 60 seconds.</span>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/10 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <Logo size="sm" variant="dark" />
            </div>
            <div className="text-gray-400 text-sm">
              © {new Date().getFullYear()} HVAC Revenue OS. Revenue operations for field service teams.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
