/**
 * Minimal React / R3F mocks for dry-running GeneratedScene on the server (and
 * in tests) before the client mounts it inside Canvas. Catches temporal-dead-zone
 * bugs like "Cannot access 'isTensionWarning' before initialization" that
 * new Function() alone cannot see.
 */

export type SceneCompileResult = { ok: true } | { ok: false; issues: string[] };

function noop(): void {
  /* mock */
}

export function createSceneCompileMocks() {
  const mockReact = {
    createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({
      type,
      props,
      children,
    }),
    Fragment: Symbol.for("react.fragment"),
    useMemo: <T,>(fn: () => T) => fn(),
    useState: <T,>(init: T | (() => T)) => [
      typeof init === "function" ? (init as () => T)() : init,
      noop,
    ] as const,
    useEffect: noop,
    useRef: <T,>(init?: T) => ({ current: init ?? null }),
  };

  class Vector2 {
    x: number;
    y: number;
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
  }
  class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
  }

  const THREE = {
    Vector2,
    Vector3,
    MathUtils: {
      lerp: (a: number, b: number, t: number) => a + (b - a) * t,
      degToRad: (d: number) => (d * Math.PI) / 180,
      clamp: (v: number, min: number, max: number) => Math.min(max, Math.max(min, v)),
    },
    Color: class {
      constructor(_?: string | number) {}
      set() {
        return this;
      }
    },
    CatmullRomCurve3: class {
      points: unknown[];
      constructor(pts: unknown[] = []) {
        this.points = pts;
      }
      getPoint() {
        return new Vector3();
      }
    },
    Shape: class {
      moveTo() {}
      lineTo() {}
      quadraticCurveTo() {}
      bezierCurveTo() {}
      absarc() {}
    },
    DoubleSide: 2,
    BackSide: 1,
    FrontSide: 0,
  };

  const useThree = () => ({
    camera: {
      position: { x: 0, y: 2, z: 5, set: noop },
      lookAt: noop,
      updateProjectionMatrix: noop,
    },
    gl: { domElement: {}, setPixelRatio: noop },
    scene: {},
    size: { width: 800, height: 600 },
  });

  return {
    React: mockReact,
    useFrame: noop,
    useRef: mockReact.useRef,
    useState: mockReact.useState,
    useEffect: mockReact.useEffect,
    useMemo: mockReact.useMemo,
    THREE,
    useThree,
    useFrameR3F: noop,
    Html: () => null,
    Line: () => null,
    Text: () => null,
  };
}

/** Errors that indicate real LLM bugs, not incomplete mocks. */
function isActionableRenderError(message: string): boolean {
  if (/before initialization/i.test(message)) return true;
  if (/ReferenceError:/i.test(message) && /is not defined/i.test(message)) {
    if (/\b(window|document|process|localStorage|navigator)\b/i.test(message)) return false;
    return true;
  }
  if (/GeneratedScene is not a function/i.test(message)) return true;
  if (/useMemo first argument must be a function/i.test(message)) return true;
  return false;
}

function formatRenderError(message: string): string {
  const tdz = message.match(/Cannot access '(\w+)' before initialization/i);
  if (tdz) {
    const name = tdz[1];
    return (
      `RUNTIME TDZ: '${name}' is used before its const/let declaration. ` +
      `Move 'const ${name} = ...' ABOVE every reference to ${name}. ` +
      `useMemo/useState initialisers run immediately — they cannot reference bindings declared later.`
    );
  }
  return `RUNTIME (dry-run render): ${message}`;
}

/**
 * Parse + invoke GeneratedScene once with sandbox mocks.
 * `transformedCode` must already be sucrase JSX → React.createElement output.
 */
export function tryRenderGeneratedScene(transformedCode: string): SceneCompileResult {
  const mocks = createSceneCompileMocks();
  try {
    // eslint-disable-next-line no-new-func
    const factory = new Function(
      "React",
      "useFrame",
      "useRef",
      "useState",
      "useEffect",
      "useMemo",
      "THREE",
      "useThree",
      "useFrameR3F",
      "Html",
      "Line",
      "Text",
      `${transformedCode}\nreturn typeof GeneratedScene !== 'undefined' ? GeneratedScene : null;`,
    ) as (...args: unknown[]) => unknown;

    const GeneratedScene = factory(
      mocks.React,
      mocks.useFrame,
      mocks.useRef,
      mocks.useState,
      mocks.useEffect,
      mocks.useMemo,
      mocks.THREE,
      mocks.useThree,
      mocks.useFrameR3F,
      mocks.Html,
      mocks.Line,
      mocks.Text,
    );

    if (typeof GeneratedScene !== "function") {
      return { ok: false, issues: ["GeneratedScene is not a function after compile."] };
    }

    (GeneratedScene as (props?: Record<string, unknown>) => unknown)({});
    return { ok: true };
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e);
    if (isActionableRenderError(msg)) {
      return { ok: false, issues: [formatRenderError(msg)] };
    }
    // Incomplete mocks can throw on exotic THREE usage — do not block shipping.
    return { ok: true };
  }
}
