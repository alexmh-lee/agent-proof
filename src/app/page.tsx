import {
  ArrowDownRight,
  ArrowRight,
  Braces,
  Check,
  Fingerprint,
  Gauge,
  Globe2,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { IdentityDemo } from "@/components/identity-demo";

const tickerItems = [
  "WEB BOT AUTH",
  "ED25519",
  "RFC 9421",
  "PORTABLE IDENTITY",
  "CLIENT-SIDE KEYS",
  "REQUEST SIGNATURES",
];

const steps = [
  {
    number: "01",
    title: "Generate",
    copy: "Create a dedicated Ed25519 key pair for each agent. Private keys are generated locally and stay under your control.",
    icon: KeyRound,
  },
  {
    number: "02",
    title: "Publish",
    copy: "Expose the public key at a stable HTTPS identity URL in the Web Bot Auth directory format.",
    icon: Globe2,
  },
  {
    number: "03",
    title: "Prove",
    copy: "Sign outbound HTTP requests so compatible websites and infrastructure can verify which agent sent them.",
    icon: ShieldCheck,
  },
];

const capabilities = [
  {
    title: "Portable by design",
    copy: "Use an identity you can move to your own domain. Your agent should not be trapped behind ours.",
    icon: Globe2,
  },
  {
    title: "Keys you control",
    copy: "Generate in-browser today, then connect your own KMS as your agent moves into production.",
    icon: LockKeyhole,
  },
  {
    title: "Lifecycle, handled",
    copy: "Rotate, revoke, expire, and monitor agent keys from one operational control plane.",
    icon: RefreshCw,
  },
  {
    title: "Compatibility checks",
    copy: "Catch malformed directories and signatures before a CDN or website rejects your traffic.",
    icon: Braces,
  },
];

export default function Home() {
  return (
    <main className="overflow-hidden">
      <nav className="relative z-20 border-b border-ink">
        <div className="mx-auto flex h-18 max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <a href="#" className="flex items-center gap-2.5">
            <span className="flex size-8 rotate-3 items-center justify-center rounded-lg border border-ink bg-lime">
              <Fingerprint size={18} strokeWidth={2.2} />
            </span>
            <span className="text-lg font-semibold tracking-[-0.04em]">
              AgentProof
            </span>
          </a>
          <div className="hidden items-center gap-7 text-sm md:flex">
            <a className="transition hover:opacity-55" href="#how">
              How it works
            </a>
            <a className="transition hover:opacity-55" href="#product">
              Product
            </a>
            <a className="transition hover:opacity-55" href="#lab">
              Identity lab
            </a>
          </div>
          <a
            href="#lab"
            className="btn-lift flex h-10 items-center gap-2 rounded-xl border border-ink bg-ink px-4 text-sm font-semibold text-paper"
          >
            Try the lab
            <ArrowDownRight size={15} />
          </a>
        </div>
      </nav>

      <section className="noise relative border-b border-ink bg-paper-bright">
        <div className="dot-grid absolute inset-y-0 right-0 hidden w-[34%] border-l border-ink lg:block" />
        <div className="relative mx-auto max-w-[1440px] px-5 pt-16 pb-12 sm:px-8 sm:pt-24 lg:px-12 lg:pt-28 lg:pb-20">
          <div className="mb-7 flex items-center gap-3">
            <span className="rounded-full border border-ink bg-lime px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider">
              Private preview
            </span>
            <span className="font-mono text-xs text-muted">
              Built on the emerging Web Bot Auth standard
            </span>
          </div>

          <h1 className="display max-w-[1140px]">
            A passport for
            <br />
            every <span className="text-violet">agent.</span>
          </h1>

          <div className="mt-10 grid gap-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
            <p className="max-w-2xl text-lg leading-8 text-muted sm:text-xl sm:leading-9">
              Give your AI agent a portable cryptographic identity. AgentProof
              helps you create keys, publish them correctly, and prove which
              agent is behind every signed request.
            </p>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <a
                href="#lab"
                className="btn-lift flex h-13 items-center gap-2 rounded-xl border border-ink bg-lime px-6 text-sm font-semibold"
              >
                Create a test identity
                <ArrowRight size={17} />
              </a>
              <a
                href="#how"
                className="flex h-13 items-center rounded-xl border border-line bg-paper px-6 text-sm font-semibold transition hover:border-ink"
              >
                See how it works
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="marquee border-b border-ink bg-lime py-3.5">
        <div className="marquee-track">
          {[...tickerItems, ...tickerItems].map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="flex items-center font-mono text-xs font-semibold tracking-[0.11em]"
            >
              {item}
              <Sparkles size={13} className="mx-7" />
            </span>
          ))}
        </div>
      </div>

      <section id="how" className="border-b border-ink py-20 sm:py-28">
        <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
          <div className="mb-14 grid gap-5 lg:grid-cols-2 lg:items-end">
            <div>
              <p className="eyebrow mb-4 text-violet">
                The protocol, simplified
              </p>
              <h2 className="section-title max-w-xl">
                Identity in three moves.
              </h2>
            </div>
            <p className="max-w-xl text-lg leading-8 text-muted lg:justify-self-end">
              AgentProof packages open cryptographic standards into a workflow
              that takes minutes—not a security engineering sprint.
            </p>
          </div>

          <div className="grid border-t border-l border-ink md:grid-cols-3">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <article
                  key={step.number}
                  className="relative min-h-[330px] border-r border-b border-ink bg-paper-bright p-7 sm:p-9"
                >
                  <div className="mb-20 flex items-start justify-between">
                    <span className="font-mono text-xs text-muted">
                      / {step.number}
                    </span>
                    <span className="flex size-11 items-center justify-center rounded-full border border-ink bg-paper">
                      <Icon size={19} strokeWidth={1.8} />
                    </span>
                  </div>
                  <h3 className="mb-3 text-3xl font-semibold tracking-[-0.05em]">
                    {step.title}
                  </h3>
                  <p className="max-w-sm leading-7 text-muted">{step.copy}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="lab" className="border-b border-ink bg-violet py-20 sm:py-28">
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8 lg:px-12">
          <div className="mb-12 grid gap-6 text-white lg:grid-cols-[1fr_0.7fr] lg:items-end">
            <div>
              <p className="eyebrow mb-4 text-lime">Live identity lab</p>
              <h2 className="section-title max-w-2xl">
                Don&apos;t take our word for it.
              </h2>
            </div>
            <p className="max-w-xl text-lg leading-8 text-white/70 lg:justify-self-end">
              Generate a real Ed25519 key pair and verify a signature in your
              browser. Nothing leaves this page.
            </p>
          </div>
          <IdentityDemo />
          <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-widest text-white/60">
            Experimental demo · keys are not persisted or registered with
            third-party verifiers
          </p>
        </div>
      </section>

      <section
        id="product"
        className="border-b border-ink bg-ink py-20 text-paper sm:py-28"
      >
        <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
          <div className="mb-14 grid gap-8 lg:grid-cols-[1fr_0.8fr]">
            <div>
              <p className="eyebrow mb-4 text-lime">
                From key to control plane
              </p>
              <h2 className="section-title max-w-3xl">
                The boring identity work, handled.
              </h2>
            </div>
            <div className="rounded-2xl border border-white/20 p-6 lg:self-end">
              <div className="mb-3 flex items-center gap-2">
                <span className="size-2 rounded-full bg-orange" />
                <p className="font-mono text-[10px] uppercase tracking-widest text-paper/60">
                  Important distinction
                </p>
              </div>
              <p className="leading-7 text-paper/80">
                A valid signature proves identity—not intent, reputation, or
                permission. Websites always retain control over what an agent
                may access.
              </p>
            </div>
          </div>

          <div className="grid gap-px overflow-hidden rounded-2xl border border-white/20 bg-white/20 md:grid-cols-2">
            {capabilities.map((capability) => {
              const Icon = capability.icon;
              return (
                <article
                  key={capability.title}
                  className="min-h-60 bg-ink p-7 sm:p-9"
                >
                  <Icon
                    size={24}
                    strokeWidth={1.6}
                    className="mb-14 text-lime"
                  />
                  <h3 className="mb-3 text-2xl font-semibold tracking-[-0.04em]">
                    {capability.title}
                  </h3>
                  <p className="max-w-md leading-7 text-paper/60">
                    {capability.copy}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-ink bg-orange">
        <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[1fr_0.62fr]">
          <div className="px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
            <p className="eyebrow mb-4">Why now</p>
            <h2 className="section-title mb-8 max-w-3xl">
              The web can&apos;t run on “trust me, I&apos;m an agent.”
            </h2>
            <p className="max-w-2xl text-lg leading-8 text-ink/70">
              Cloudflare, AWS, Akamai, Vercel, Google, and other infrastructure
              providers are adopting cryptographic bot identity. The standard
              is emerging; the developer experience is not.
            </p>
          </div>
          <div className="dot-grid flex items-center border-t border-ink p-8 lg:border-t-0 lg:border-l lg:p-12">
            <div className="w-full rounded-2xl border border-ink bg-paper-bright p-6 shadow-[6px_6px_0_#141512]">
              <div className="mb-8 flex items-center justify-between">
                <span className="eyebrow text-muted">Request check</span>
                <Gauge size={19} />
              </div>
              {[
                "Identity directory found",
                "Public key resolved",
                "Request signature valid",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 border-t border-line py-4 text-sm"
                >
                  <span className="flex size-5 items-center justify-center rounded-full bg-lime">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  {item}
                </div>
              ))}
              <div className="mt-2 flex items-center justify-between rounded-xl bg-ink px-4 py-3 text-paper">
                <span className="font-mono text-xs">Cryptographic identity</span>
                <span className="font-mono text-xs text-lime">VERIFIED</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-paper-bright py-24 text-center sm:py-32">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <span className="mx-auto mb-8 flex size-13 rotate-3 items-center justify-center rounded-xl border border-ink bg-lime">
            <Fingerprint size={25} />
          </span>
          <p className="eyebrow mb-5 text-violet">
            We&apos;re building in public
          </p>
          <h2 className="section-title mb-7">
            Your agent already has a name.
            <br />
            Give it proof.
          </h2>
          <p className="mx-auto mb-9 max-w-2xl text-lg leading-8 text-muted">
            Try the identity lab, break it, and tell us what your production
            agent would need next.
          </p>
          <a
            href="#lab"
            className="btn-lift inline-flex h-13 items-center gap-2 rounded-xl border border-ink bg-lime px-6 text-sm font-semibold"
          >
            Generate an identity
            <ArrowRight size={17} />
          </a>
        </div>
      </section>

      <footer className="border-t border-ink bg-paper px-5 py-7 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-3 text-xs text-muted sm:flex-row">
          <p>© 2026 AgentProof. A working concept, built in public.</p>
          <p className="font-mono">IDENTITY ≠ PERMISSION · YOU DECIDE ACCESS</p>
        </div>
      </footer>
    </main>
  );
}
