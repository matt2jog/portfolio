import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const vertexShader = `
precision highp float;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;
varying vec2 vUv;
uniform vec2 resolution;
uniform float time;
uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform vec3 waveColor;
uniform vec2 mousePos;
uniform int enableMouseInteraction;
uniform float mouseRadius;
uniform float colorNum;
uniform float pixelSize;

vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0,0.0,1.0,1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0,0.0,1.0,1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0/41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00,g00), dot(g01,g01), dot(g10,g10), dot(g11,g11)));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  float freq = waveFrequency;
  for (int i = 0; i < 4; i++) {
    value += amp * abs(cnoise(p));
    p *= freq;
    amp *= waveAmplitude;
  }
  return value;
}

float pattern(vec2 p) {
  vec2 p2 = p - time * waveSpeed;
  return fbm(p + fbm(p2));
}

float bayer(int x, int y) {
  int index = y * 8 + x;
  if (index == 0) return 0.0/64.0; if (index == 1) return 48.0/64.0; if (index == 2) return 12.0/64.0; if (index == 3) return 60.0/64.0;
  if (index == 4) return 3.0/64.0; if (index == 5) return 51.0/64.0; if (index == 6) return 15.0/64.0; if (index == 7) return 63.0/64.0;
  if (index == 8) return 32.0/64.0; if (index == 9) return 16.0/64.0; if (index == 10) return 44.0/64.0; if (index == 11) return 28.0/64.0;
  if (index == 12) return 35.0/64.0; if (index == 13) return 19.0/64.0; if (index == 14) return 47.0/64.0; if (index == 15) return 31.0/64.0;
  if (index == 16) return 8.0/64.0; if (index == 17) return 56.0/64.0; if (index == 18) return 4.0/64.0; if (index == 19) return 52.0/64.0;
  if (index == 20) return 11.0/64.0; if (index == 21) return 59.0/64.0; if (index == 22) return 7.0/64.0; if (index == 23) return 55.0/64.0;
  if (index == 24) return 40.0/64.0; if (index == 25) return 24.0/64.0; if (index == 26) return 36.0/64.0; if (index == 27) return 20.0/64.0;
  if (index == 28) return 43.0/64.0; if (index == 29) return 27.0/64.0; if (index == 30) return 39.0/64.0; if (index == 31) return 23.0/64.0;
  if (index == 32) return 2.0/64.0; if (index == 33) return 50.0/64.0; if (index == 34) return 14.0/64.0; if (index == 35) return 62.0/64.0;
  if (index == 36) return 1.0/64.0; if (index == 37) return 49.0/64.0; if (index == 38) return 13.0/64.0; if (index == 39) return 61.0/64.0;
  if (index == 40) return 34.0/64.0; if (index == 41) return 18.0/64.0; if (index == 42) return 46.0/64.0; if (index == 43) return 30.0/64.0;
  if (index == 44) return 33.0/64.0; if (index == 45) return 17.0/64.0; if (index == 46) return 45.0/64.0; if (index == 47) return 29.0/64.0;
  if (index == 48) return 10.0/64.0; if (index == 49) return 58.0/64.0; if (index == 50) return 6.0/64.0; if (index == 51) return 54.0/64.0;
  if (index == 52) return 9.0/64.0; if (index == 53) return 57.0/64.0; if (index == 54) return 5.0/64.0; if (index == 55) return 53.0/64.0;
  if (index == 56) return 42.0/64.0; if (index == 57) return 26.0/64.0; if (index == 58) return 38.0/64.0; if (index == 59) return 22.0/64.0;
  if (index == 60) return 41.0/64.0; if (index == 61) return 25.0/64.0; if (index == 62) return 37.0/64.0;
  return 21.0/64.0;
}

vec3 dither(vec3 color) {
  vec2 scaledCoord = floor(gl_FragCoord.xy / pixelSize);
  int x = int(mod(scaledCoord.x, 8.0));
  int y = int(mod(scaledCoord.y, 8.0));
  float threshold = bayer(x, y) - 0.25;
  float stepSize = 1.0 / (colorNum - 1.0);
  color += threshold * stepSize;
  color = clamp(color - 0.2, 0.0, 1.0);
  return floor(color * (colorNum - 1.0) + 0.5) / (colorNum - 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec2 p = uv - 0.5;
  p.x *= resolution.x / resolution.y;
  float f = pattern(p);
  if (enableMouseInteraction == 1) {
    vec2 mouseNDC = (mousePos / resolution - 0.5) * vec2(1.0, -1.0);
    mouseNDC.x *= resolution.x / resolution.y;
    float dist = length(p - mouseNDC);
    float effect = 1.0 - smoothstep(0.0, mouseRadius, dist);
    f -= 0.5 * effect;
  }
  vec3 color = mix(vec3(0.0), waveColor, f);
  gl_FragColor = vec4(dither(color), 1.0);
}
`;

interface IntroDitherProps {
  waveColor?: [number, number, number];
  colorNum?: number;
  pixelSize?: number;
  waveAmplitude?: number;
  waveFrequency?: number;
  waveSpeed?: number;
  enableMouseInteraction?: boolean;
  mouseRadius?: number;
}

function DitherPlane({
  waveColor = [0.5, 0.5, 0.5],
  colorNum = 4,
  pixelSize = 2,
  waveAmplitude = 0.3,
  waveFrequency = 3,
  waveSpeed = 0.05,
  enableMouseInteraction = true,
  mouseRadius = 0.3,
}: IntroDitherProps) {
  const { viewport, size, gl } = useThree();
  const mouseRef = useRef(new THREE.Vector2());
  const uniformsRef = useRef({
    time: new THREE.Uniform(0),
    resolution: new THREE.Uniform(new THREE.Vector2(1, 1)),
    waveSpeed: new THREE.Uniform(waveSpeed),
    waveFrequency: new THREE.Uniform(waveFrequency),
    waveAmplitude: new THREE.Uniform(waveAmplitude),
    waveColor: new THREE.Uniform(new THREE.Color(...waveColor)),
    mousePos: new THREE.Uniform(new THREE.Vector2(0, 0)),
    enableMouseInteraction: new THREE.Uniform(enableMouseInteraction ? 1 : 0),
    mouseRadius: new THREE.Uniform(mouseRadius),
    colorNum: new THREE.Uniform(colorNum),
    pixelSize: new THREE.Uniform(pixelSize),
  });

  useEffect(() => {
    const dpr = gl.getPixelRatio();
    const width = Math.floor(size.width * dpr);
    const height = Math.floor(size.height * dpr);
    uniformsRef.current.resolution.value.set(width, height);

    if (mouseRef.current.lengthSq() === 0) {
      mouseRef.current.set(width * 0.5, height * 0.5);
    }
  }, [gl, size]);

  useEffect(() => {
    if (!enableMouseInteraction) return;

    const setPointerPosition = (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      const dpr = gl.getPixelRatio();
      mouseRef.current.set(
        THREE.MathUtils.clamp((clientX - rect.left) * dpr, 0, rect.width * dpr),
        THREE.MathUtils.clamp((clientY - rect.top) * dpr, 0, rect.height * dpr),
      );
    };

    const handlePointerMove = (event: PointerEvent) => {
      setPointerPosition(event.clientX, event.clientY);
    };

    const handleTouch = (event: TouchEvent) => {
      const touch = event.touches[0] ?? event.changedTouches[0];
      if (!touch) return;
      setPointerPosition(touch.clientX, touch.clientY);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("touchstart", handleTouch, { passive: true });
    window.addEventListener("touchmove", handleTouch, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("touchstart", handleTouch);
      window.removeEventListener("touchmove", handleTouch);
    };
  }, [enableMouseInteraction, gl]);

  useFrame(({ clock }) => {
    const uniforms = uniformsRef.current;
    uniforms.time.value = clock.getElapsedTime();
    uniforms.waveSpeed.value = waveSpeed;
    uniforms.waveFrequency.value = waveFrequency;
    uniforms.waveAmplitude.value = waveAmplitude;
    uniforms.waveColor.value.set(...waveColor);
    uniforms.enableMouseInteraction.value = enableMouseInteraction ? 1 : 0;
    uniforms.mouseRadius.value = mouseRadius;
    uniforms.colorNum.value = colorNum;
    uniforms.pixelSize.value = pixelSize;
    uniforms.mousePos.value.copy(mouseRef.current);
  });

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniformsRef.current} />
    </mesh>
  );
}

export function IntroDither(props: IntroDitherProps) {
  return (
    <Canvas
      className="h-full w-full"
      camera={{ position: [0, 0, 6] }}
      dpr={1}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
    >
      <DitherPlane {...props} />
    </Canvas>
  );
}
