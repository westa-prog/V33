import React, { useEffect, useRef } from 'react';
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeroProps {
  trustBadge?: {
    text: string;
    icons?: string[];
  };
  headline: {
    line1: string;
    line2: string;
  };
  subtitle: string;
  buttons?: {
    primary?: {
      text: string;
      onClick?: () => void;
    };
    secondary?: {
      text: string;
      onClick?: () => void;
    };
  };
  className?: string;
  children?: React.ReactNode;
}

const defaultShaderSource = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)
float rnd(vec2 p) {
  p=fract(p*vec2(12.9898,78.233));
  p+=dot(p,p+34.56);
  return fract(p.x*p.y);
}
float noise(in vec2 p) {
  vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  float a=rnd(i), b=rnd(i+vec2(1,0)), c=rnd(i+vec2(0,1)), d=rnd(i+1.);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p) {
  float t=.0, a=1.; mat2 m=mat2(1.,-.5,.2,1.2);
  for (int i=0; i<5; i++) {
    t+=a*noise(p);
    p*=2.*m;
    a*=.5;
  }
  return t;
}
float clouds(vec2 p) {
  float d=1., t=.0;
  for (float i=.0; i<3.; i++) {
    float a=d*fbm(i*10.+p.x*.2+.2*(1.+i)*p.y+d+i*i+p);
    t=mix(t,d,a);
    d=a;
    p*=2./(i+1.);
  }
  return t;
}
void main(void) {
  vec2 uv=(FC-.5*R)/MN,st=uv*vec2(2,1);
  vec3 col=vec3(0);
  float bg=clouds(vec2(st.x+T*.5,-st.y));
  uv*=1.-.3*(sin(T*.2)*.5+.5);
  for (float i=1.; i<12.; i++) {
    uv+=.1*cos(i*vec2(.1+.01*i, .8)+i*i+T*.5+.1*uv.x);
    vec2 p=uv;
    float d=length(p);
    col+=.00125/d*(cos(sin(i)*vec3(1,2,3))+1.);
    float b=noise(i+p+bg*1.731);
    col+=.002*b/length(max(p,vec2(b*p.x*.02,p.y)));
    col=mix(col,vec3(bg*.25,bg*.137,bg*.05),d);
  }
  O=vec4(col,1);
}`;

const useShaderBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const rendererRef = useRef<WebGLRendererImpl | null>(null);
  const pointersRef = useRef<PointerHandler | null>(null);

  class WebGLRendererImpl {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext;
    private program: WebGLProgram | null = null;
    private vs: WebGLShader | null = null;
    private fs: WebGLShader | null = null;
    private buffer: WebGLBuffer | null = null;
    private mouseMove = [0, 0];
    private mouseCoords = [0, 0];
    private pointerCoords = [0, 0];
    private nbrOfPointers = 0;
    private readonly vertexSrc = `#version 300 es
precision highp float;
in vec4 position;
void main(){gl_Position=position;}`;
    private readonly vertices = [-1, 1, -1, -1, 1, 1, 1, -1];

    constructor(canvas: HTMLCanvasElement) {
      const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
      if (!gl) throw new Error('WebGL2 is not available in this browser.');
      this.canvas = canvas;
      this.gl = gl;
    }

    updateShader(source: string) {
      this.reset();
      this.setup(source);
      this.init();
    }

    updateMove(deltas: number[]) {
      this.mouseMove = deltas;
    }

    updateMouse(coords: number[]) {
      this.mouseCoords = coords;
    }

    updatePointerCoords(coords: number[]) {
      this.pointerCoords = coords;
    }

    updatePointerCount(nbr: number) {
      this.nbrOfPointers = nbr;
    }

    updateViewport() {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    private compile(shader: WebGLShader, source: string) {
      this.gl.shaderSource(shader, source);
      this.gl.compileShader(shader);
      if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
        throw new Error(this.gl.getShaderInfoLog(shader) || 'Shader compilation error.');
      }
    }

    test(source: string) {
      const shader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
      if (!shader) return 'Unable to allocate shader.';
      this.gl.shaderSource(shader, source);
      this.gl.compileShader(shader);
      const result = this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)
        ? null
        : this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      return result;
    }

    reset() {
      if (this.program) {
        if (this.vs) {
          this.gl.detachShader(this.program, this.vs);
          this.gl.deleteShader(this.vs);
        }
        if (this.fs) {
          this.gl.detachShader(this.program, this.fs);
          this.gl.deleteShader(this.fs);
        }
        this.gl.deleteProgram(this.program);
      }
      if (this.buffer) this.gl.deleteBuffer(this.buffer);
      this.program = null;
      this.vs = null;
      this.fs = null;
      this.buffer = null;
    }

    private setup(source: string) {
      this.vs = this.gl.createShader(this.gl.VERTEX_SHADER);
      this.fs = this.gl.createShader(this.gl.FRAGMENT_SHADER);
      if (!this.vs || !this.fs) throw new Error('Unable to create shaders.');
      this.compile(this.vs, this.vertexSrc);
      this.compile(this.fs, source);
      this.program = this.gl.createProgram();
      if (!this.program) throw new Error('Unable to create program.');
      this.gl.attachShader(this.program, this.vs);
      this.gl.attachShader(this.program, this.fs);
      this.gl.linkProgram(this.program);
      if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
        throw new Error(this.gl.getProgramInfoLog(this.program) || 'Program link error.');
      }
    }

    private init() {
      if (!this.program) return;
      this.buffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(this.vertices), this.gl.STATIC_DRAW);
      const position = this.gl.getAttribLocation(this.program, 'position');
      this.gl.enableVertexAttribArray(position);
      this.gl.vertexAttribPointer(position, 2, this.gl.FLOAT, false, 0, 0);
    }

    render(now = 0) {
      if (!this.program || !this.buffer) return;
      this.gl.clearColor(0, 0, 0, 1);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      this.gl.useProgram(this.program);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
      this.gl.uniform2f(this.gl.getUniformLocation(this.program, 'resolution'), this.canvas.width, this.canvas.height);
      this.gl.uniform1f(this.gl.getUniformLocation(this.program, 'time'), now * 1e-3);
      this.gl.uniform2f(this.gl.getUniformLocation(this.program, 'move'), this.mouseMove[0], this.mouseMove[1]);
      this.gl.uniform2f(this.gl.getUniformLocation(this.program, 'touch'), this.mouseCoords[0], this.mouseCoords[1]);
      this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'pointerCount'), this.nbrOfPointers);
      this.gl.uniform2fv(this.gl.getUniformLocation(this.program, 'pointers'), this.pointerCoords);
      this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  class PointerHandler {
    private active = false;
    private pointers = new Map<number, number[]>();
    private lastCoords = [0, 0];
    private moves = [0, 0];
    private scale = 1;

    constructor(element: HTMLCanvasElement) {
      const map = (x: number, y: number) => [x * this.scale, element.height - y * this.scale];
      const clearPointer = (e: PointerEvent) => {
        if (this.count === 1) this.lastCoords = this.first;
        this.pointers.delete(e.pointerId);
        this.active = this.pointers.size > 0;
      };

      element.addEventListener('pointerdown', (e) => {
        this.active = true;
        this.pointers.set(e.pointerId, map(e.offsetX, e.offsetY));
      });
      element.addEventListener('pointerup', clearPointer);
      element.addEventListener('pointerleave', clearPointer);
      element.addEventListener('pointermove', (e) => {
        if (!this.active) return;
        this.lastCoords = [e.offsetX, e.offsetY];
        this.pointers.set(e.pointerId, map(e.offsetX, e.offsetY));
        this.moves = [this.moves[0] + e.movementX, this.moves[1] + e.movementY];
      });
    }

    updateScale(scale: number) {
      this.scale = scale;
    }

    get count() {
      return this.pointers.size;
    }

    get move() {
      return this.moves;
    }

    get coords() {
      const coords = this.pointers.size > 0 ? Array.from(this.pointers.values()).flat() : [0, 0];
      return coords.slice(0, 12);
    }

    get first() {
      const first = this.pointers.values().next().value as number[] | undefined;
      return first || this.lastCoords;
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = Math.max(1, 0.5 * window.devicePixelRatio);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      rendererRef.current?.updateViewport();
      pointersRef.current?.updateScale(dpr);
    };

    const loop = (now: number) => {
      if (!rendererRef.current || !pointersRef.current) return;
      rendererRef.current.updateMouse(pointersRef.current.first);
      rendererRef.current.updatePointerCount(pointersRef.current.count);
      rendererRef.current.updatePointerCoords(pointersRef.current.coords);
      rendererRef.current.updateMove(pointersRef.current.move);
      rendererRef.current.render(now);
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    try {
      rendererRef.current = new WebGLRendererImpl(canvas);
      pointersRef.current = new PointerHandler(canvas);
      resize();
      if (rendererRef.current.test(defaultShaderSource) === null) {
        rendererRef.current.updateShader(defaultShaderSource);
      }
      loop(0);
      window.addEventListener('resize', resize);
    } catch (error) {
      console.error(error);
    }

    return () => {
      window.removeEventListener('resize', resize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      rendererRef.current?.reset();
    };
  }, []);

  return canvasRef;
};

const Hero: React.FC<HeroProps> = ({ trustBadge, headline, subtitle, buttons, className = '', children }) => {
  const canvasRef = useShaderBackground();

  return (
    <div className={cn('relative min-h-screen w-full overflow-hidden bg-black text-white', className)}>
      <style>{`
        @keyframes fade-in-down { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-down { animation: fade-in-down 0.8s ease-out forwards; }
        .animate-fade-in-up { animation: fade-in-up 0.8s ease-out forwards; opacity: 0; }
        .animation-delay-200 { animation-delay: 0.2s; }
        .animation-delay-400 { animation-delay: 0.4s; }
        .animation-delay-600 { animation-delay: 0.6s; }
        .animation-delay-800 { animation-delay: 0.8s; }
      `}</style>

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.16),transparent_32%),linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.82))]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-between px-4 py-6 md:px-8 lg:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 backdrop-blur-md">
            <ShieldCheck className="h-4 w-4 text-amber-300" />
            <span className="text-xs font-black uppercase tracking-[0.22em] text-amber-100">Leader A1</span>
          </div>
        </div>

        <div className="grid items-center gap-10 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div className="max-w-4xl">
            {trustBadge && (
              <div className="mb-8 animate-fade-in-down">
                <div className="inline-flex items-center gap-2 rounded-full border border-orange-300/30 bg-orange-500/10 px-5 py-3 text-sm text-orange-100 backdrop-blur-md">
                  <Sparkles className="h-4 w-4 text-amber-200" />
                  <span>{trustBadge.text}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h1 className="animate-fade-in-up animation-delay-200 bg-gradient-to-r from-orange-300 via-yellow-300 to-amber-100 bg-clip-text text-5xl font-black tracking-[-0.06em] text-transparent md:text-7xl lg:text-8xl">
                {headline.line1}
              </h1>
              <h1 className="animate-fade-in-up animation-delay-400 bg-gradient-to-r from-yellow-200 via-orange-300 to-red-300 bg-clip-text text-5xl font-black tracking-[-0.06em] text-transparent md:text-7xl lg:text-8xl">
                {headline.line2}
              </h1>
            </div>

            <div className="animate-fade-in-up animation-delay-600 mt-8 max-w-2xl">
              <p className="text-lg leading-relaxed text-orange-50/85 md:text-xl lg:text-2xl">{subtitle}</p>
            </div>

            {buttons && (
              <div className="animate-fade-in-up animation-delay-800 mt-10 flex flex-col gap-4 sm:flex-row">
                {buttons.primary && (
                  <button onClick={buttons.primary.onClick} className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 px-8 py-4 text-base font-black text-slate-950 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(251,146,60,0.25)]">
                    {buttons.primary.text}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
                {buttons.secondary && (
                  <button onClick={buttons.secondary.onClick} className="rounded-full border border-orange-300/30 bg-white/[0.08] px-8 py-4 text-base font-bold text-orange-50 transition-all duration-300 hover:scale-[1.02] hover:bg-white/[0.12]">
                    {buttons.secondary.text}
                  </button>
                )}
              </div>
            )}
          </div>

          {children ? <div className="w-full">{children}</div> : null}
        </div>
      </div>
    </div>
  );
};

export default Hero;
