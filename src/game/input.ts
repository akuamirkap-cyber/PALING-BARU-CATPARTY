export interface ControlState {
  mx: number; // -1..1 (screen right)
  mz: number; // -1..1 (screen down / toward camera)
  run: boolean;
  jump: boolean; // edge
  punch: boolean; // edge
  punchHeld: boolean;
  grab: boolean; // held
  grabPress: boolean; // edge: grab -> hoist overhead -> throw
  headbutt: boolean; // edge
  lift: boolean; // edge: pick up / lift / throw
}

export const emptyControl = (): ControlState => ({
  mx: 0,
  mz: 0,
  run: false,
  jump: false,
  punch: false,
  punchHeld: false,
  grab: false,
  grabPress: false,
  headbutt: false,
  lift: false,
});

const keys = new Set<string>();
const pressedEdge = new Set<string>();

// touch state (written by TouchControls component)
export const touch = {
  active: false,
  mx: 0,
  mz: 0,
  jump: false,
  punch: false,
  punchHeld: false,
  grab: false,
  grabPress: false,
  headbutt: false,
  lift: false,
};

const GAME_KEYS = new Set([
  "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyJ", "KeyK", "KeyL",
  "Numpad0", "Numpad1", "Numpad2", "Numpad3", "Enter",
  "Comma", "Period", "Slash", "KeyE", "Numpad4", "Semicolon",
]);

function down(e: KeyboardEvent) {
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  if (!keys.has(e.code)) pressedEdge.add(e.code);
  keys.add(e.code);
}
function up(e: KeyboardEvent) {
  keys.delete(e.code);
}
function blur() {
  keys.clear();
}

let attached = 0;
let inputEnabled = true;

export function setInputEnabled(val: boolean) {
  inputEnabled = val;
  if (!val) {
    keys.clear();
    pressedEdge.clear();
    touch.active = false;
  }
}

export function isInputEnabled() {
  return inputEnabled;
}

export function attachInput() {
  if (attached++ === 0) {
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
  }
}
export function detachInput() {
  if (--attached === 0) {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
    keys.clear();
  }
}

const k = (c: string) => (inputEnabled ? keys.has(c) : false);
const e = (...c: string[]) => (inputEnabled ? c.some((x) => pressedEdge.has(x)) : false);

/** Read P1 (WASD + touch) or P2 (arrows) control state. Call once per frame. */
export function readControls(player: 1 | 2, twoPlayer: boolean): ControlState {
  const s = emptyControl();
  if (!inputEnabled) return s;
  if (player === 1) {
    s.mx = (k("KeyD") ? 1 : 0) - (k("KeyA") ? 1 : 0);
    s.mz = (k("KeyS") ? 1 : 0) - (k("KeyW") ? 1 : 0);
    if (!twoPlayer) {
      s.mx += (k("ArrowRight") ? 1 : 0) - (k("ArrowLeft") ? 1 : 0);
      s.mz += (k("ArrowDown") ? 1 : 0) - (k("ArrowUp") ? 1 : 0);
    }
    s.run = k("ShiftLeft") || (!twoPlayer && k("ShiftRight"));
    s.jump = e("Space");
    s.punch = e("KeyJ");
    s.punchHeld = k("KeyJ");
    s.grab = k("KeyK");
    s.grabPress = e("KeyK");
    s.headbutt = e("KeyL");
    s.lift = e("KeyE");
    if (touch.active) {
      if (Math.abs(touch.mx) + Math.abs(touch.mz) > 0.05) {
        s.mx = touch.mx;
        s.mz = touch.mz;
        s.run = s.run || Math.hypot(touch.mx, touch.mz) > 0.92;
      }
      s.jump = s.jump || touch.jump;
      s.punch = s.punch || touch.punch;
      s.punchHeld = s.punchHeld || touch.punchHeld;
      s.grab = s.grab || touch.grab;
      s.grabPress = s.grabPress || touch.grabPress;
      s.headbutt = s.headbutt || touch.headbutt;
      s.lift = s.lift || touch.lift;
    }
  } else {
    s.mx = (k("ArrowRight") ? 1 : 0) - (k("ArrowLeft") ? 1 : 0);
    s.mz = (k("ArrowDown") ? 1 : 0) - (k("ArrowUp") ? 1 : 0);
    s.run = k("ShiftRight");
    s.jump = e("Numpad0", "Enter");
    s.punch = e("Numpad1", "Comma");
    s.punchHeld = k("Numpad1") || k("Comma");
    s.grab = k("Numpad2") || k("Period");
    s.grabPress = e("Numpad2", "Period");
    s.headbutt = e("Numpad3", "Slash");
    s.lift = e("Numpad4", "Semicolon");
  }
  const len = Math.hypot(s.mx, s.mz);
  if (len > 1) {
    s.mx /= len;
    s.mz /= len;
  }
  return s;
}

export function endFrameInput() {
  pressedEdge.clear();
  touch.jump = false;
  touch.punch = false;
  touch.grabPress = false;
  touch.headbutt = false;
  touch.lift = false;
}
