export default function FooterBar({ heroCount, version }) {
  return (
    <footer className="flex h-5 items-center border-t border-slate-800 bg-slate-950/80 px-3 text-[10px] text-slate-500 sm:px-6">
      {heroCount != null && version ? (
        <span>{heroCount} heroes - v{version}</span>
      ) : (
        <span>Loading roster</span>
      )}
    </footer>
  )
}
