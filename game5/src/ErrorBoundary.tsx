import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<{ children: ReactNode; onReset?: () => void }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center gap-4 bg-[#ffaa16] text-white" style={{ fontFamily: "'Lilita One', sans-serif" }}>
        <div className="text-4xl">OOPS! SOMETHING BROKE</div>
        <div className="text-sm opacity-80 max-w-lg text-center font-mono">{this.state.err.message}</div>
        <button className="bg-white text-[#3b2a1a] rounded-2xl px-6 py-3 text-xl" onClick={() => { this.setState({ err: null }); this.props.onReset?.(); }}>RETRY</button>
      </div>
    );
  }
}
