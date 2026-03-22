"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowDown, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger);

type StatCard = {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning";
};

interface HorizonHeroSectionProps {
  className?: string;
  title: string;
  boardName: string;
  subtitleLines: [string, string];
  stats: StatCard[];
  appraisals: string[];
}

type ThreeRefs = {
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  renderer: THREE.WebGLRenderer | null;
  stars: THREE.Points[];
  nebula: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null;
  mountains: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[];
  atmosphere: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | null;
  animationId: number | null;
};

const statToneClass = (tone: StatCard["tone"]) => {
  if (tone === "success") return "text-emerald-300 border-emerald-400/30 bg-emerald-400/10";
  if (tone === "warning") return "text-amber-200 border-amber-300/30 bg-amber-300/10";
  return "text-indigo-100 border-white/15 bg-white/[0.08]";
};

export function HorizonHeroSection({
  className,
  title,
  boardName,
  subtitleLines,
  stats,
  appraisals,
}: HorizonHeroSectionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const smoothCameraPos = useRef({ x: 0, y: 30, z: 220 });
  const targetCameraPos = useRef({ x: 0, y: 30, z: 220 });
  const [progress, setProgress] = useState(0);

  const threeRefs = useRef<ThreeRefs>({
    scene: null,
    camera: null,
    renderer: null,
    stars: [],
    nebula: null,
    mountains: [],
    atmosphere: null,
    animationId: null,
  });

  const safeTitle = useMemo(() => title.toUpperCase(), [title]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const refs = threeRefs.current;

    refs.scene = new THREE.Scene();
    refs.scene.fog = new THREE.FogExp2(0x020617, 0.00055);

    refs.camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 2500);
    refs.camera.position.set(0, 24, 220);

    refs.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    refs.renderer.setSize(container.clientWidth, container.clientHeight);
    refs.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    refs.renderer.setClearColor(0x000000, 0);

    const createStarField = () => {
      if (!refs.scene) return;
      for (let layer = 0; layer < 3; layer += 1) {
        const starCount = 1800;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount; i += 1) {
          const radius = 260 + Math.random() * 900;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(Math.random() * 2 - 1);

          positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
          positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
          positions[i * 3 + 2] = radius * Math.cos(phi);

          const color = new THREE.Color();
          const choice = Math.random();
          if (choice < 0.68) color.setHSL(0.62, 0.7, 0.85);
          else if (choice < 0.9) color.setHSL(0.82, 0.5, 0.75);
          else color.setHSL(0.12, 0.55, 0.78);

          colors[i * 3] = color.r;
          colors[i * 3 + 1] = color.g;
          colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        const material = new THREE.PointsMaterial({
          size: 2.2 - layer * 0.35,
          vertexColors: true,
          transparent: true,
          opacity: 0.75 - layer * 0.18,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const stars = new THREE.Points(geometry, material);
        refs.scene.add(stars);
        refs.stars.push(stars);
      }
    };

    const createNebula = () => {
      if (!refs.scene) return;
      const geometry = new THREE.PlaneGeometry(1600, 900, 64, 64);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          color1: { value: new THREE.Color(0x4f46e5) },
          color2: { value: new THREE.Color(0xdb2777) },
        },
        vertexShader: `
          varying vec2 vUv;
          uniform float time;
          void main() {
            vUv = uv;
            vec3 pos = position;
            pos.z += sin(pos.x * 0.01 + time) * cos(pos.y * 0.013 + time * 0.8) * 18.0;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform vec3 color1;
          uniform vec3 color2;
          void main() {
            float mixFactor = sin(vUv.x * 12.0) * cos(vUv.y * 9.0);
            vec3 color = mix(color1, color2, mixFactor * 0.5 + 0.5);
            float alpha = 0.18 * (1.0 - length(vUv - 0.5) * 1.6);
            gl_FragColor = vec4(color, alpha);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const nebula = new THREE.Mesh(geometry, material);
      nebula.position.set(0, 120, -780);
      refs.scene.add(nebula);
      refs.nebula = nebula;
    };

    const createMountains = () => {
      if (!refs.scene) return;
      const layers = [
        { z: -60, height: 74, color: 0x0f172a, opacity: 1 },
        { z: -120, height: 92, color: 0x111827, opacity: 0.82 },
        { z: -190, height: 118, color: 0x172554, opacity: 0.6 },
      ];

      layers.forEach((layer, layerIndex) => {
        const points: THREE.Vector2[] = [];
        const segments = 42;
        for (let i = 0; i <= segments; i += 1) {
          const x = (i / segments - 0.5) * 1600;
          const y =
            Math.sin(i * 0.18) * layer.height +
            Math.sin(i * 0.06 + layerIndex) * layer.height * 0.45 +
            Math.random() * layer.height * 0.18 -
            180;
          points.push(new THREE.Vector2(x, y));
        }
        points.push(new THREE.Vector2(1600, -450));
        points.push(new THREE.Vector2(-1600, -450));

        const shape = new THREE.Shape(points);
        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshBasicMaterial({
          color: layer.color,
          transparent: true,
          opacity: layer.opacity,
          side: THREE.DoubleSide,
        });
        const mountain = new THREE.Mesh(geometry, material);
        mountain.position.set(0, 42 + layerIndex * 8, layer.z);
        mountain.userData = { baseX: 0, baseY: mountain.position.y, baseZ: layer.z, speed: 1 + layerIndex * 0.35 };
        refs.scene.add(mountain);
        refs.mountains.push(mountain);
      });
    };

    const createAtmosphere = () => {
      if (!refs.scene) return;
      const geometry = new THREE.SphereGeometry(520, 24, 24);
      const material = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 } },
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          uniform float time;
          void main() {
            float intensity = pow(0.8 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.2);
            vec3 atmosphere = vec3(0.24, 0.45, 1.0) * intensity * (0.92 + sin(time * 1.5) * 0.06);
            gl_FragColor = vec4(atmosphere, intensity * 0.22);
          }
        `,
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
      });
      const atmosphere = new THREE.Mesh(geometry, material);
      atmosphere.position.z = -320;
      refs.scene.add(atmosphere);
      refs.atmosphere = atmosphere;
    };

    createStarField();
    createNebula();
    createMountains();
    createAtmosphere();

    const render = () => {
      const time = Date.now() * 0.00035;

      refs.stars.forEach((stars, index) => {
        stars.rotation.z += 0.00008 * (index + 1);
        stars.rotation.x = Math.sin(time * 2 + index) * 0.02;
      });

      if (refs.nebula) {
        refs.nebula.material.uniforms.time.value = time * 4;
        refs.nebula.rotation.z = time * 0.06;
      }

      if (refs.atmosphere) {
        refs.atmosphere.material.uniforms.time.value = time * 3;
      }

      refs.mountains.forEach((mountain, index) => {
        const speed = mountain.userData.speed || 1;
        mountain.position.x = mountain.userData.baseX + Math.sin(time * (0.7 + index * 0.18)) * speed * 8;
        mountain.position.y = mountain.userData.baseY + Math.cos(time * (0.95 + index * 0.12)) * speed * 3;
      });

      if (refs.camera) {
        const smooth = 0.055;
        smoothCameraPos.current.x += (targetCameraPos.current.x - smoothCameraPos.current.x) * smooth;
        smoothCameraPos.current.y += (targetCameraPos.current.y - smoothCameraPos.current.y) * smooth;
        smoothCameraPos.current.z += (targetCameraPos.current.z - smoothCameraPos.current.z) * smooth;
        refs.camera.position.set(
          smoothCameraPos.current.x + Math.sin(time * 2) * 1.2,
          smoothCameraPos.current.y + Math.cos(time * 1.6) * 0.8,
          smoothCameraPos.current.z
        );
        refs.camera.lookAt(0, 10, -500);
      }

      refs.renderer?.render(refs.scene as THREE.Scene, refs.camera as THREE.Camera);
      refs.animationId = requestAnimationFrame(render);
    };

    const onResize = () => {
      if (!refs.camera || !refs.renderer || !container) return;
      refs.camera.aspect = container.clientWidth / container.clientHeight;
      refs.camera.updateProjectionMatrix();
      refs.renderer.setSize(container.clientWidth, container.clientHeight);
      refs.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    const onScroll = () => {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const windowHeight = window.innerHeight || 1;
      const nextProgress = Math.min(Math.max((windowHeight - rect.top) / (rect.height + windowHeight * 0.25), 0), 1);
      setProgress(nextProgress);
      targetCameraPos.current = {
        x: 0,
        y: 30 + nextProgress * 12,
        z: 220 - nextProgress * 270,
      };
    };

    onResize();
    onScroll();
    render();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (refs.animationId) cancelAnimationFrame(refs.animationId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      refs.stars.forEach((stars) => {
        stars.geometry.dispose();
        (stars.material as THREE.PointsMaterial).dispose();
      });
      refs.mountains.forEach((mountain) => {
        mountain.geometry.dispose();
        mountain.material.dispose();
      });
      refs.nebula?.geometry.dispose();
      refs.nebula?.material.dispose();
      refs.atmosphere?.geometry.dispose();
      refs.atmosphere?.material.dispose();
      refs.renderer?.dispose();
    };
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (menuRef.current) {
        gsap.from(menuRef.current, { x: -48, opacity: 0, duration: 0.9, ease: "power3.out" });
      }
      if (titleRef.current) {
        gsap.from(titleRef.current.querySelectorAll(".title-char"), {
          y: 120,
          opacity: 0,
          stagger: 0.04,
          duration: 1.15,
          ease: "power4.out",
        });
      }
      if (contentRef.current) {
        gsap.from(contentRef.current.querySelectorAll("[data-hero-fade]"), {
          y: 28,
          opacity: 0,
          stagger: 0.12,
          duration: 0.9,
          delay: 0.3,
          ease: "power3.out",
        });
      }
      if (progressRef.current) {
        gsap.from(progressRef.current, { opacity: 0, y: 20, duration: 0.8, delay: 0.7 });
      }
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={containerRef}
      className={cn(
        "relative min-h-[115vh] overflow-hidden rounded-[32px] border border-slate-200/70 bg-[#020617] text-white shadow-[0_30px_120px_rgba(15,23,42,0.35)] dark:border-slate-800",
        className
      )}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.22),transparent_30%),linear-gradient(180deg,rgba(2,6,23,0.15),rgba(2,6,23,0.82))]" />

      <div
        ref={menuRef}
        className="absolute left-5 top-5 z-10 flex items-center gap-4 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 backdrop-blur-md"
      >
        <div className="flex gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/[0.65]" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/[0.35]" />
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.32em] text-indigo-200">Welcome</span>
      </div>

      <div className="relative z-10 flex min-h-[115vh] flex-col justify-between px-6 pb-8 pt-24 md:px-10 lg:px-14">
        <div ref={contentRef} className="max-w-5xl">
          <div
            data-hero-fade
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.08] px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-indigo-100"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {boardName}
          </div>

          <h1 ref={titleRef} className="max-w-4xl text-5xl font-black uppercase leading-[0.9] tracking-[-0.06em] text-white sm:text-6xl lg:text-8xl">
            {safeTitle.split("").map((char, index) => (
              <span key={`${char}-${index}`} className="title-char inline-block">
                {char === " " ? "\u00A0" : char}
              </span>
            ))}
          </h1>

          <div className="mt-8 max-w-2xl space-y-2 text-base text-slate-200/90 md:text-xl">
            <p data-hero-fade>{subtitleLines[0]}</p>
            <p data-hero-fade className="text-slate-300/80">
              {subtitleLines[1]}
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-hero-fade>
            {stats.map((stat) => (
              <div
                key={stat.label}
                className={cn(
                  "rounded-2xl border px-4 py-4 backdrop-blur-md transition-transform duration-300 hover:-translate-y-1",
                  statToneClass(stat.tone)
                )}
              >
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/60">{stat.label}</p>
                <p className="mt-3 text-3xl font-black text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[28px] border border-white/12 bg-white/[0.06] p-5 backdrop-blur-xl" data-hero-fade>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-indigo-200">
              <TrendingUp className="h-3.5 w-3.5" />
              Appraisals
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {appraisals.map((line) => (
                <div key={line} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-200">
                  {line}
                </div>
              ))}
            </div>
          </div>

          <div
            ref={progressRef}
            className="flex flex-col justify-between rounded-[28px] border border-white/12 bg-black/[0.25] p-5 backdrop-blur-xl"
          >
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/55">Scroll Into The App</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-sky-300 to-fuchsia-400 transition-[width] duration-200"
                  style={{ width: `${Math.max(progress * 100, 6)}%` }}
                />
              </div>
            </div>
            <div className="mt-8 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Welcome back</p>
                <p className="mt-1 text-sm text-slate-300">Scroll down to continue into connection, broadcast, and board tools.</p>
              </div>
              <div className="rounded-full border border-white/12 bg-white/[0.08] p-3">
                <ArrowDown className="h-5 w-5 text-indigo-200" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export const Component = HorizonHeroSection;
