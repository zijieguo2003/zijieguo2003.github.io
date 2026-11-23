// The renderer is shared across language switches so preferences and motion stay in sync.
window.mountProfileShowcase = (function () {
  'use strict';

  const palettes = [
    ['mist', '雾蓝暖杏', 'Blue mist', '#F8F6F0', '#172934', '#9EC4BF', '#30667D', '#E8B58F'],
    ['cobalt', '冰川钴蓝', 'Glacier blue', '#F6F9FC', '#142B48', '#B8DEED', '#2851A4', '#8CE5DE'],
    ['celadon', '青瓷稻金', 'Celadon gold', '#F8F7EF', '#203B32', '#B8CFBC', '#366F64', '#EAC781'],
    ['rose', '胭脂月白', 'Rose ink', '#FCF7F3', '#402634', '#DEC1CB', '#8B4059', '#E7B39B'],
    ['violet', '暮紫蜜桃', 'Violet dusk', '#FAF6FA', '#332C49', '#CDC2DF', '#70619D', '#FFBA9D'],
    ['ochre', '赭石岩砂', 'Warm ochre', '#FBF6EC', '#422E26', '#E5C5A0', '#AD5F42', '#F1CC79'],
    ['graphite', '石墨银灰', 'Graphite', '#F6F6F3', '#232924', '#D5D7CE', '#626B69', '#C0CB80'],
    ['aurora', '夜航极光', 'Night aurora', '#111C2D', '#ECF2F5', '#344768', '#286E78', '#92D8B2']
  ];
  const storageKey = 'zijie-profile-palette';
  let palette = palettes.find(entry => entry[0] === 'cobalt');
  try {
    palette = palettes.find(entry => entry[0] === localStorage.getItem(storageKey)) || palette;
  } catch (_) { /* Storage is optional. */ }
  let renderer, motionButton, activeStudy = 0, pausedByUser = null;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isPlaying = () => pausedByUser === null ? !media.matches : !pausedByUser;

  function makeRenderer(canvas) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
    if (!gl) return null;
    const program = gl.createProgram();
    function attach(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    attach(gl.VERTEX_SHADER, `attribute vec2 point;
      varying vec2 uv;
      void main() { uv = point * .5 + .5; gl_Position = vec4(point,0.,1.); }`);
    attach(gl.FRAGMENT_SHADER, `precision mediump float;
      varying vec2 uv;
      uniform float time;
      uniform vec3 paper, wash, deep, accent;
      void main() {
        vec2 q = uv;
        float phase = time * .13;
        q.x += .24*sin(3.3*q.y+phase) + .15*sin(6.2*q.y+1.6*q.x-phase*.81);
        q.y += .22*cos(5.8*q.x-.79*phase) + .09*sin(7.*q.y+q.x+phase*.6);
        float f = .54*q.x + .64*q.y + .21*sin(5.6*q.x+2.4*q.y+phase*.38);
        vec3 color = mix(wash, deep, smoothstep(.48,1.24,f));
        color = mix(color, accent, .94*exp(-9.*abs(f-.64)));
        color = mix(color, paper, .85*exp(-12.*abs(f-.80)));
        color += .019*(.5+.5*sin(120.*f+2.*sin(6.*q.x-phase)));
        gl_FragColor = vec4(mix(paper,color,smoothstep(.08,.69,uv.x)),1.);
      }`);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'point');
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(position);
    const timeUniform = gl.getUniformLocation(program, 'time');
    const colors = ['paper','wash','deep','accent'].map(key => gl.getUniformLocation(program, key));
    let frame = 0, time = 0, previous = 0, visible = false, lost = false;
    function draw() {
      if (lost || !canvas.clientWidth || !canvas.clientHeight) return;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width; canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.uniform1f(timeUniform, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function tick(now) {
      if (!previous || now - previous >= 40) {
        if (previous) time += Math.min(.12, (now - previous) / 1000);
        previous = now;
        draw();
      }
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      cancelAnimationFrame(frame);
      previous = 0;
      if (!lost && visible && !document.hidden) {
        draw();
        if (isPlaying()) frame = requestAnimationFrame(tick);
      }
    }
    new ResizeObserver(draw).observe(canvas);
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }).observe(canvas);
    document.addEventListener('visibilitychange', sync);
    canvas.addEventListener('webglcontextlost', () => {
      lost = true; sync(); canvas.hidden = true;
      if (motionButton) motionButton.hidden = true;
    });
    return { canvas, sync, setColors() {
      if (lost) return;
      [palette[3],palette[5],palette[6],palette[7]].forEach((hex, i) => {
        const rgb = hex.slice(1).match(/../g).map(v => parseInt(v,16) / 255);
        gl.uniform3fv(colors[i], rgb);
      });
      draw();
    }};
  }
  function updateMotion() {
    if (!motionButton) return;
    const zh = document.documentElement.lang === 'zh-CN';
    motionButton.textContent = isPlaying() ? (zh ? '暂停流动' : 'Pause motion') : (zh ? '播放流动' : 'Play motion');
    if (renderer) renderer.sync();
  }
  media.addEventListener('change', () => { pausedByUser = null; updateMotion(); });

  function applyPalette() {
    const style = document.documentElement.style;
    ['--paper','--ink','--wash','--deep','--glow'].forEach((key,i) => style.setProperty(key,palette[i+3]));
    if (renderer) renderer.setColors();
  }
  function bindStudies(container) {
    const tabs = Array.from(container.querySelectorAll('[role=tab]'));
    const panels = container.querySelectorAll('[role=tabpanel]');
    function select(index) {
      activeStudy = index;
      tabs.forEach((tab,i) => {
        tab.setAttribute('aria-selected', String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
        panels[i].hidden = i !== index;
      });
    }
    tabs.forEach((tab,i) => {
      tab.onclick = () => select(i);
      tab.onkeydown = event => {
        const index = { ArrowRight:(i+1)%tabs.length, ArrowLeft:(i+tabs.length-1)%tabs.length, Home:0, End:tabs.length-1 }[event.key];
        if (index === undefined) return;
        event.preventDefault(); select(index); tabs[index].focus();
      };
    });
    select(activeStudy);
    const dialog = container.querySelector('dialog');
    container.querySelectorAll('.study-zoom').forEach(button => {
      button.onclick = () => {
        const image = button.querySelector('img'), enlarged = dialog.querySelector('img');
        enlarged.src = image.src; enlarged.alt = image.alt; dialog.showModal();
      };
    });
  }
  return function mount(content, language) {
    const select = content.querySelector('.palette-select');
    if (!select) return;
    const placeholder = content.querySelector('.color-field');
    if (renderer === undefined) renderer = makeRenderer(placeholder);
    if (renderer && renderer.canvas !== placeholder) placeholder.replaceWith(renderer.canvas);
    if (!renderer) placeholder.hidden = true;
    motionButton = content.querySelector('.motion-toggle');
    motionButton.hidden = !renderer || renderer.canvas.hidden;
    motionButton.onclick = () => { pausedByUser = isPlaying(); updateMotion(); };
    palettes.forEach(entry => select.add(new Option(entry[language === 'zh' ? 1 : 2],entry[0])));
    select.value = palette[0];
    select.onchange = () => {
      palette = palettes.find(entry => entry[0] === select.value);
      try { localStorage.setItem(storageKey, palette[0]); } catch (_) { /* Optional. */ }
      applyPalette();
    };
    applyPalette();
    updateMotion();
    bindStudies(content.querySelector('.showcase'));
  };
})();
