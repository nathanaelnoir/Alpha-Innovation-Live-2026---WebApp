import { useEffect, useRef } from 'react'
import type { Coordinate } from './types'

interface ResponseStreamProps {
  coordinate: Coordinate
  flow?: 'horizontal' | 'vertical'
  showAccent?: boolean
  className?: string
  testId?: string
}

const vertexShaderSource = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// Adapted from "Ikeda Data Stream" by Patricio Gonzalez Vivo (2015),
// used here with the user's authorization and a blue-accented output palette.
const fragmentShaderSource = `
#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;
uniform float u_vertical;
uniform float u_accent;

float random(in float x) {
  return fract(sin(x) * 1e4);
}

float random(in vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float pattern(vec2 st, vec2 velocity, float threshold) {
  vec2 position = floor(st + velocity);
  return step(
    threshold,
    random(100.0 + position * 0.000001) + random(position.x) * 0.5
  );
}

void main() {
  vec2 st = gl_FragCoord.xy / u_resolution.xy;
  st.x *= u_resolution.x / u_resolution.y;

  vec2 grid = mix(vec2(50.0, 25.0), vec2(25.0, 50.0), u_vertical);
  st *= grid;

  vec2 integerPosition = floor(st);
  vec2 cellPosition = fract(st);
  vec2 flowDirection = mix(vec2(-1.0, 0.0), vec2(0.0, 1.0), u_vertical);
  float lane = mix(integerPosition.y, integerPosition.x, u_vertical);
  vec2 velocity = flowDirection
    * u_time * 2.0 * max(grid.x, grid.y)
    * random(1.0 + lane);

  vec2 offset = mix(vec2(0.1, 0.0), vec2(0.0, 0.1), u_vertical);
  float inputPosition = mix(
    u_mouse.x / u_resolution.x,
    u_mouse.y / u_resolution.y,
    u_vertical
  );
  float threshold = 0.5 + inputPosition;
  float firstSignal = pattern(st + offset, velocity, threshold);
  float secondSignal = pattern(st, velocity, threshold);
  float blueSignal = pattern(st - offset, velocity, threshold);
  float margin = step(0.1, mix(cellPosition.y, cellPosition.x, u_vertical));
  float dataSignal = max(firstSignal, max(secondSignal, blueSignal)) * margin;

  float blueAccent = blueSignal * step(
    0.88,
    random(integerPosition + vec2(17.0, 3.0))
  ) * margin * u_accent;
  vec3 background = vec3(0.015);
  vec3 whiteInk = vec3(0.945);
  vec3 blueInk = vec3(54.0, 91.0, 216.0) / 255.0;
  vec3 ink = mix(whiteInk, blueInk, blueAccent);
  vec3 color = mix(background, ink, dataSignal);

  gl_FragColor = vec4(color, 1.0);
}
`

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export function ResponseStream({
  coordinate,
  flow = 'horizontal',
  showAccent = true,
  className = '',
  testId = 'response-success-animation',
}: ResponseStreamProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof window.WebGLRenderingContext === 'undefined') return

    const gl = canvas.getContext('webgl')
    if (!gl) return

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
    if (!vertexShader || !fragmentShader) return

    const program = gl.createProgram()
    const buffer = gl.createBuffer()
    if (!program || !buffer) return

    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return

    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    const mouseLocation = gl.getUniformLocation(program, 'u_mouse')
    const timeLocation = gl.getUniformLocation(program, 'u_time')
    const verticalLocation = gl.getUniformLocation(program, 'u_vertical')
    const accentLocation = gl.getUniformLocation(program, 'u_accent')
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(bounds.width * pixelRatio))
      canvas.height = Math.max(1, Math.round(bounds.height * pixelRatio))
    }
    resize()

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(resize)
    resizeObserver?.observe(canvas)

    const startedAt = performance.now()
    let frameId = 0
    const render = (now: number) => {
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
      gl.uniform2f(
        mouseLocation,
        coordinate.x * canvas.width,
        coordinate.y * canvas.height,
      )
      gl.uniform1f(timeLocation, (now - startedAt) / 1000)
      gl.uniform1f(verticalLocation, flow === 'vertical' ? 1 : 0)
      gl.uniform1f(accentLocation, showAccent ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      frameId = window.requestAnimationFrame(render)
    }
    frameId = window.requestAnimationFrame(render)

    return () => {
      window.cancelAnimationFrame(frameId)
      resizeObserver?.disconnect()
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
    }
  }, [coordinate, flow, showAccent])

  return (
    <div
      className={`response-stream${className ? ` ${className}` : ''}`}
      data-testid={testId}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
    </div>
  )
}
