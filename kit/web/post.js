// WebGL2 post-processing over any source canvas, driven by time.
// const fx = createPost(outputCanvas, { grain: 0.06, vignette: 0.35, chroma: 0.002 });
// in render(t): draw your scene into sourceCanvas, then fx.render(sourceCanvas, t, { flash: 0.2 });
// Uniforms can change every frame. All effects are deterministic in t.

const VERT = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * 0.5 + 0.5; uv.y = 1.0 - uv.y; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D src; uniform vec2 res; uniform float t;
uniform float grain, vignette, chroma, curvature, scanlines, bloom, halftone, flash, leak, leakHue, warp, exposure, saturation, contrast;
uniform vec3 tint;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0); }
vec2 curve(vec2 u){ u = u*2.0-1.0; vec2 off = abs(u.yx)/vec2(6.0,4.0); u = u + u*off*off*curvature*4.0; return u*0.5+0.5; }
void main(){
  vec2 u = curvature > 0.0 ? curve(uv) : uv;
  u += warp * vec2(sin(u.y*18.0+t*2.0), cos(u.x*14.0-t*1.7)) * 0.004;
  if(u.x<0.0||u.x>1.0||u.y<0.0||u.y>1.0){ o = vec4(0,0,0,1); return; }
  vec2 dir = (u-0.5) * chroma;
  vec3 c = vec3(texture(src,u+dir).r, texture(src,u).g, texture(src,u-dir).b);
  if(bloom > 0.0){
    vec3 b = vec3(0.0); float k = 0.0;
    for(int i=-3;i<=3;i++) for(int j=-3;j<=3;j++){ vec2 d = vec2(i,j)/res*4.0; float w = 1.0/(1.0+float(i*i+j*j)); b += max(texture(src,u+d).rgb-0.6,0.0)*w; k += w; }
    c += b/k * bloom * 3.0;
  }
  if(halftone > 0.0){
    float s = 6.0; vec2 g = fract(u*res/s)-0.5; float l = dot(c, vec3(0.299,0.587,0.114));
    float dotv = smoothstep(0.5, 0.45, length(g) / sqrt(1.0 - l + 0.001) * 0.7);
    c = mix(c, c*dotv, halftone);
  }
  if(scanlines > 0.0) c *= 1.0 - scanlines * (0.5 + 0.5*sin(u.y*res.y*3.14159));
  c = (c - 0.5) * contrast + 0.5;
  float l = dot(c, vec3(0.299,0.587,0.114));
  c = mix(vec3(l), c, saturation) * tint * exposure;
  if(leak > 0.0){ float m = smoothstep(0.9, 0.0, distance(u, vec2(0.15 + 0.1*sin(t*0.7), 0.2))); c += hue(leakHue) * m * leak; }
  c += flash;
  if(vignette > 0.0) c *= 1.0 - vignette * pow(distance(uv, vec2(0.5)) * 1.35, 2.2);
  c += (hash(uv*res + floor(t*24.0)) - 0.5) * grain;
  o = vec4(clamp(c,0.0,1.0),1.0);
}`;

export const defaults = {
  grain: 0, vignette: 0, chroma: 0, curvature: 0, scanlines: 0, bloom: 0, halftone: 0,
  flash: 0, leak: 0, leakHue: 0.08, warp: 0, exposure: 1, saturation: 1, contrast: 1, tint: [1, 1, 1],
};

export function createPost(canvas, base = {}) {
  canvas.width = canvas.width || innerWidth;
  canvas.height = canvas.height || innerHeight;
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false });
  if (!gl) throw new Error('WebGL2 unavailable');
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const u = (n) => gl.getUniformLocation(prog, n);
  return {
    gl,
    render(source, t, overrides = {}) {
      const p = { ...defaults, ...base, ...overrides };
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.uniform2f(u('res'), canvas.width, canvas.height);
      gl.uniform1f(u('t'), t);
      for (const k of Object.keys(defaults)) if (k !== 'tint') gl.uniform1f(u(k), p[k]);
      gl.uniform3f(u('tint'), ...p.tint);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.finish();
    },
  };
}
