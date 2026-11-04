import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Shown when the subtree throws (e.g. WebGL died). */
  fallback?: ReactNode;
  label?: string;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one broken subtree (usually a 3D canvas) from blanking the whole game.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(`[meow-brawl] ${this.props.label ?? "screen"} crashed`, error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="crash-note" role="alert">
        <div className="crash-card">
          <b className="crash-emoji">😿</b>
          <strong>Bagian 3D gagal dimuat</strong>
          <span>Kucingnya masih aman — cuma panggung 3D-nya yang error. Coba lagi, atau balik ke menu.</span>
          <code>{error.message || "Konteks WebGL tidak tersedia"}</code>
          <button type="button" onClick={this.reset}>
            {this.props.onReset ? "KEMBALI & COBA LAGI" : "COBA LAGI"}
          </button>
        </div>
      </div>
    );
  }
}
