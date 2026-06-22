import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ============ CONFIGURATION & SCENE SETUP ============
const CONFIG = {
    colors: [
        new THREE.Color(0x7c3aed), // Violet (Hero)
        new THREE.Color(0x06b6d4), // Cyan (Servicios)
        new THREE.Color(0x10b981), // Emerald (Simulador)
        new THREE.Color(0xf97316), // Orange (Calculadora)
        new THREE.Color(0x7c3aed)  // Violet (Contacto)
    ],
    lerpSpeed: 0.05,
    floatAmplitude: 0.15,
    floatSpeed: 0.8
};

// Section positions for the 3D cube
const SECTION_CONFIGS = [
    // 0: Hero
    {
        desktop: { x: 0, y: 0, scale: 1.0 },
        mobile: { x: 0, y: -0.3, scale: 0.55 }
    },
    // 1: Servicios
    {
        desktop: { x: 1.6, y: 0.2, scale: 0.8 },
        mobile: { x: 0, y: -0.4, scale: 0.45 }
    },
    // 2: Simulador
    {
        desktop: { x: 0.8, y: 0.15, scale: 0.65 },
        mobile: { x: 0, y: -0.45, scale: 0.45 }
    },
    // 3: Calculadora
    {
        desktop: { x: 1.5, y: 0.0, scale: 0.9 },
        mobile: { x: 0, y: -0.45, scale: 0.45 }
    },
    // 4: Contacto
    {
        desktop: { x: 0, y: 1.2, scale: 0.45 },
        mobile: { x: 0, y: 0.8, scale: 0.35 }
    }
];

// ============ STATE ============
let activeSectionIndex = 0;
let currentPosition = { x: 0, y: 0 };
let currentScale = 1.0;
let targetColor = CONFIG.colors[0].clone();
let currentColor = CONFIG.colors[0].clone();

// Reactivity modifiers (driven by ROI Calculator)
let roiSpeedModifier = 0.0;

// ============ SCENE SETTINGS ============
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070a13);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
container.appendChild(renderer.domElement);

// ============ ENVIRONMENT MAP ============
function createEnvironmentMap() {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    const gradientGeo = new THREE.SphereGeometry(50, 64, 64);
    const gradientMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
            uColorTop: { value: new THREE.Color(0x111827) },
            uColorBottom: { value: new THREE.Color(0x030712) },
            uColorAccent: { value: new THREE.Color(0x1e1b4b) }
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPos.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uColorTop;
            uniform vec3 uColorBottom;
            uniform vec3 uColorAccent;
            varying vec3 vWorldPosition;
            
            void main() {
                float h = normalize(vWorldPosition).y;
                vec3 col = mix(uColorBottom, uColorTop, smoothstep(-0.5, 0.5, h));
                float noise = sin(vWorldPosition.x * 0.5) * cos(vWorldPosition.z * 0.5) * 0.1;
                col += uColorAccent * noise;
                gl_FragColor = vec4(col, 1.0);
            }
        `
    });
    
    const envMesh = new THREE.Mesh(gradientGeo, gradientMat);
    envScene.add(envMesh);

    const light1 = new THREE.PointLight(0x7c3aed, 50, 20);
    light1.position.set(5, 5, 5);
    envScene.add(light1);

    const light2 = new THREE.PointLight(0x06b6d4, 30, 15);
    light2.position.set(-5, -3, 3);
    envScene.add(light2);

    const envMap = pmremGenerator.fromScene(envScene, 0, 0.1, 100).texture;
    pmremGenerator.dispose();
    return envMap;
}

scene.environment = createEnvironmentMap();

// ============ ICE / GLASS CUBE ============
const cubeGeometry = new RoundedBoxGeometry(2, 2, 2, 6, 0.25);
const cubeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.05,
    roughness: 0.08,
    transmission: 0.95,
    thickness: 1.5,
    ior: 1.5,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    attenuationColor: 0xe8f4f8,
    attenuationDistance: 2.0,
    specularIntensity: 1.0,
    envMapIntensity: 1.5,
    transparent: true,
    opacity: 0.85
});

const iceCube = new THREE.Mesh(cubeGeometry, cubeMaterial);
scene.add(iceCube);

// ============ INNER CORE ============
const coreGeometry = new THREE.IcosahedronGeometry(0.55, 2);
const coreMaterial = new THREE.MeshStandardMaterial({
    color: CONFIG.colors[0],
    emissive: CONFIG.colors[0],
    emissiveIntensity: 3.5,
    metalness: 0.9,
    roughness: 0.1
});

const innerCore = new THREE.Mesh(coreGeometry, coreMaterial);
scene.add(innerCore);

// Glow Sphere
const glowGeometry = new THREE.IcosahedronGeometry(0.72, 2);
const glowMaterial = new THREE.MeshBasicMaterial({
    color: CONFIG.colors[0],
    transparent: true,
    opacity: 0.18,
    side: THREE.BackSide
});
const innerGlow = new THREE.Mesh(glowGeometry, glowMaterial);
scene.add(innerGlow);

// Point light inside
const coreLight = new THREE.PointLight(CONFIG.colors[0], 6, 10);
scene.add(coreLight);

// ============ LIGHTING ============
const ambientLight = new THREE.AmbientLight(0x1f2937, 0.6);
scene.add(ambientLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 1.0);
rimLight.position.set(5, 5, -5);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0x3b82f6, 0.4);
fillLight.position.set(-5, -3, 5);
scene.add(fillLight);

// ============ POST PROCESSING ============
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.4,  // strength
    0.4,  // radius
    0.85  // threshold
);
composer.addPass(bloomPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

// ============ PARTICLES ============
const particleCount = 120;
const particlePositions = new Float32Array(particleCount * 3);
const particleSizes = new Float32Array(particleCount);

for (let i = 0; i < particleCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 3 + Math.random() * 4;

    particlePositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    particlePositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    particlePositions[i * 3 + 2] = r * Math.cos(phi);
    
    particleSizes[i] = Math.random() * 2.5 + 1;
}

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
particleGeometry.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));

const particleMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xffffff) },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
    },
    vertexShader: `
        attribute float size;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vAlpha;
        
        void main() {
            vec3 pos = position;
            pos.y += sin(uTime * 0.4 + position.x * 0.5) * 0.15;
            pos.x += cos(uTime * 0.2 + position.z * 0.5) * 0.1;
            
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = size * uPixelRatio * (180.0 / -mvPosition.z);
            vAlpha = smoothstep(7.0, 3.0, length(pos)) * 0.5;
        }
    `,
    fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        
        void main() {
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;
            float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;
            gl_FragColor = vec4(uColor, alpha);
        }
    `
});

const particles = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particles);

// ============ PERSISTENT IDLE ROTATIONS ============
const idleRotations = [
    { x: 0.1, y: 0.12, z: 0.05 },
    { x: -0.08, y: 0.15, z: 0.08 },
    { x: 0.12, y: -0.1, z: 0.06 },
    { x: -0.1, y: 0.18, z: -0.08 },
    { x: 0.08, y: 0.1, z: 0.05 }
];

// ============ INTERACTION HANDLERS & NAVIGATION ============

// Check responsive layouts
function isMobile() {
    return window.innerWidth < 768;
}

// Update target coordinates and colors
function updateActiveSection(sectionId) {
    const sectionIndexMap = {
        'hero': 0,
        'tecnologias': 0,
        'servicios': 1,
        'simulador': 2,
        'calculadora': 3,
        'testimonios': 3,
        'faq': 4,
        'blog': 4,
        'contacto': 4
    };
    
    const index = sectionIndexMap[sectionId] ?? 0;
    activeSectionIndex = index;
    
    // Update theme color dynamically in document
    const colorsHex = ['#7c3aed', '#06b6d4', '#10b981', '#f97316', '#7c3aed'];
    document.documentElement.style.setProperty('--accent', colorsHex[index]);
    document.documentElement.style.setProperty('--accent-glow', `${colorsHex[index]}26`);
    
    targetColor.copy(CONFIG.colors[index]);
}

// Scroll Intersection Observer
const sections = document.querySelectorAll('section');
const navLinks = document.querySelectorAll('.nav-link');

const observerOptions = {
    root: null,
    rootMargin: '-30% 0px -30% 0px',
    threshold: 0.1
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const activeId = entry.target.id;
            
            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${activeId}`) {
                    link.classList.add('active');
                }
            });
            
            updateActiveSection(activeId);
        }
    });
}, observerOptions);

sections.forEach(section => observer.observe(section));

// Navbar Header Scroll State
const headerEl = document.getElementById('main-header');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        headerEl.classList.add('scrolled');
    } else {
        headerEl.classList.remove('scrolled');
    }
});

// Hamburger menu handler
const hamburgerBtn = document.getElementById('hamburger-toggle');
const navMenu = document.getElementById('nav-menu');

hamburgerBtn.addEventListener('click', () => {
    const isExpanded = hamburgerBtn.getAttribute('aria-expanded') === 'true';
    hamburgerBtn.setAttribute('aria-expanded', !isExpanded);
    hamburgerBtn.classList.toggle('open');
    navMenu.classList.toggle('open');
});

// Close menu when clicking nav link
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        hamburgerBtn.classList.remove('open');
        navMenu.classList.remove('open');
    });
});

// ============ FLOW PLAYGROUND CONTROLLER ============
const flowButtons = document.querySelectorAll('.flow-btn');
const flowMetadata = {
    leads: {
        originIcon: '💬',
        originTitle: 'Cliente WhatsApp',
        targetIcon: '📁',
        targetTitle: 'HubSpot CRM',
        text: 'El cliente escribe por WhatsApp. La IA de Cerotraba analiza la consulta, extrae los datos del contacto e interés de compra, y crea un prospecto estructurado en el CRM de inmediato.'
    },
    facturas: {
        originIcon: '✉️',
        originTitle: 'Recibir Correo PDF',
        targetIcon: '📊',
        targetTitle: 'ERP Operaciones',
        text: 'Se recibe una factura en PDF adjunta en un correo electrónico. La IA lee y procesa el documento, extrae montos y conceptos, actualiza el ERP y genera un aviso de validación.'
    },
    soporte: {
        originIcon: '📥',
        originTitle: 'Ticket Recibido',
        targetIcon: '🛠️',
        targetTitle: 'Slack & Zendesk',
        text: 'Ingresa una consulta técnica de soporte. La IA clasifica su urgencia, redacta una respuesta borrador utilizando la base de conocimiento y notifica al canal de Slack correspondiente.'
    }
};

let flowTimeout1 = null;
let flowTimeout2 = null;

function runFlowAnimation(flowKey) {
    const config = flowMetadata[flowKey];
    if (!config) return;
    
    // Clear ongoing animations
    clearTimeout(flowTimeout1);
    clearTimeout(flowTimeout2);
    
    const nodeOrigin = document.getElementById('node-origin');
    const nodeAI = document.getElementById('node-ai');
    const nodeTarget = document.getElementById('node-target');
    const pipe1 = document.getElementById('pipe-1');
    const pipe2 = document.getElementById('pipe-2');
    
    const originIcon = document.getElementById('node-origin-icon');
    const originTitle = document.getElementById('node-origin-title');
    const targetIcon = document.getElementById('node-target-icon');
    const targetTitle = document.getElementById('node-target-title');
    const explanationText = document.getElementById('flow-explanation-text');
    
    // Reset visual states
    nodeOrigin.classList.remove('active');
    nodeAI.classList.remove('active');
    nodeTarget.classList.remove('active');
    pipe1.classList.remove('active');
    pipe2.classList.remove('active');
    
    // Set text immediately
    explanationText.innerText = config.text;
    originIcon.innerText = config.originIcon;
    originTitle.innerText = config.originTitle;
    targetIcon.innerText = config.targetIcon;
    targetTitle.innerText = config.targetTitle;
    
    // Trigger animated pipeline
    nodeOrigin.classList.add('active');
    
    flowTimeout1 = setTimeout(() => {
        pipe1.classList.add('active');
        
        flowTimeout2 = setTimeout(() => {
            nodeAI.classList.add('active');
            
            // Pulse the background 3D core temporarily
            coreMaterial.emissiveIntensity = 8.0;
            setTimeout(() => { coreMaterial.emissiveIntensity = 3.5; }, 500);
            
            setTimeout(() => {
                pipe2.classList.add('active');
                
                setTimeout(() => {
                    nodeTarget.classList.add('active');
                }, 1200);
            }, 500);
        }, 1200);
    }, 400);
}

flowButtons.forEach(button => {
    button.addEventListener('click', () => {
        flowButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        const flowKey = button.getAttribute('data-flow');
        runFlowAnimation(flowKey);
    });
});

// Run initial animation
runFlowAnimation('leads');

// ============ ROI CALCULATOR CONTROLLER ============
const hoursSlider = document.getElementById('hours-slider');
const rateSlider = document.getElementById('rate-slider');
const employeesSlider = document.getElementById('employees-slider');

const hoursDisplay = document.getElementById('hours-display');
const rateDisplay = document.getElementById('rate-display');
const employeesDisplay = document.getElementById('employees-display');

const monthlySavingsEl = document.getElementById('monthly-savings');
const yearlyHoursEl = document.getElementById('yearly-hours');

function calculateROI() {
    const hours = parseFloat(hoursSlider.value);
    const rate = parseFloat(rateSlider.value);
    const employees = parseFloat(employeesSlider.value);
    
    // Updates UI texts
    hoursDisplay.innerText = `${hours} horas`;
    rateDisplay.innerText = `${rate} USD`;
    employeesDisplay.innerText = `${employees} ${employees === 1 ? 'persona' : 'personas'}`;
    
    // Calculations
    const monthlyHoursSaved = hours * 4.33 * employees;
    const monthlySavings = monthlyHoursSaved * rate;
    const yearlyHoursSaved = hours * 52 * employees;
    
    // Format outputs
    monthlySavingsEl.innerText = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(monthlySavings);
    yearlyHoursEl.innerText = `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(yearlyHoursSaved)} hrs`;
    
    // Calculate speed modifier for 3D engine (0.0 to 1.0)
    // Capping maximum ROI multiplier impact around $15,000 savings
    roiSpeedModifier = Math.min(monthlySavings / 15000, 1.0);
}

[hoursSlider, rateSlider, employeesSlider].forEach(slider => {
    slider.addEventListener('input', calculateROI);
});

// Initial run
calculateROI();

// ============ CONTACT FORM HANDLER ============
const contactForm = document.getElementById('consulting-form');
const statusMessage = document.getElementById('form-status-message');
const submitBtn = document.getElementById('form-submit-btn');

contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = document.getElementById('form-name').value.trim();
    const email = document.getElementById('form-email').value.trim();
    const company = document.getElementById('form-company').value.trim();
    const message = document.getElementById('form-message').value.trim();
    
    if (!name || !email || !company || !message) {
        statusMessage.className = 'form-status error';
        statusMessage.innerText = 'Por favor, completa todos los campos requeridos (*).';
        return;
    }
    
    // Check basic email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        statusMessage.className = 'form-status error';
        statusMessage.innerText = 'Por favor, ingresa un correo corporativo válido.';
        return;
    }
    
    // Simulating sending state
    submitBtn.disabled = true;
    submitBtn.innerText = 'Enviando solicitud...';
    statusMessage.style.display = 'none';
    
    setTimeout(() => {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Solicitar Consultoría Gratuita';
        
        statusMessage.className = 'form-status success';
        statusMessage.innerText = '¡Solicitud recibida con éxito! Nos comunicaremos contigo en menos de 24 horas.';
        contactForm.reset();
        
        // Reset ROI calculator values to default visual
        calculateROI();
    }, 1500);
});

// ============ THREE.JS ANIMATION LOOP ============
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const elapsed = clock.getElapsedTime();
    const delta = clock.getDelta();

    // Particle elapsed time update
    particleMaterial.uniforms.uTime.value = elapsed;

    // Adjust float amplitude and float speed based on ROI values
    const dynamicFloatSpeed = CONFIG.floatSpeed + (roiSpeedModifier * 1.2);
    const dynamicFloatAmp = CONFIG.floatAmplitude + (roiSpeedModifier * 0.12);
    
    const floatY = Math.sin(elapsed * dynamicFloatSpeed) * dynamicFloatAmp;
    const floatX = Math.cos(elapsed * dynamicFloatSpeed * 0.7) * dynamicFloatAmp * 0.5;

    // Get current section coordinates config based on view state
    const currentConfig = SECTION_CONFIGS[activeSectionIndex];
    const isMobileLayout = isMobile();
    const targetState = isMobileLayout ? currentConfig.mobile : currentConfig.desktop;

    // Lerp position coordinates
    currentPosition.x += (targetState.x - currentPosition.x) * CONFIG.lerpSpeed;
    currentPosition.y += (targetState.y - currentPosition.y) * CONFIG.lerpSpeed;
    currentScale += (targetState.scale - currentScale) * CONFIG.lerpSpeed;

    // Rotation interpolation & additions based on ROI speedup
    const idleRotation = idleRotations[activeSectionIndex];
    const baseRotationX = idleRotation.x + (roiSpeedModifier * 0.8);
    const baseRotationY = idleRotation.y + (roiSpeedModifier * 1.5);
    const baseRotationZ = idleRotation.z + (roiSpeedModifier * 0.6);

    iceCube.rotation.x += baseRotationX * delta;
    iceCube.rotation.y += baseRotationY * delta;
    iceCube.rotation.z += baseRotationZ * delta;

    // Apply Lerp state translation
    iceCube.position.y = currentPosition.y + floatY;
    iceCube.position.x = currentPosition.x + floatX;
    iceCube.scale.setScalar(currentScale);

    // Inner core follows cube position and spins counter-direction
    innerCore.position.copy(iceCube.position);
    innerCore.rotation.x = -iceCube.rotation.x * 1.4 + elapsed * 0.4;
    innerCore.rotation.y = -iceCube.rotation.y * 1.4 + elapsed * 0.2;
    innerCore.scale.setScalar(currentScale);
    
    innerGlow.position.copy(innerCore.position);
    innerGlow.rotation.copy(innerCore.rotation);
    innerGlow.scale.setScalar(currentScale);

    // Color Lerp
    currentColor.lerp(targetColor, CONFIG.lerpSpeed);

    // Apply active color update to light sources
    coreMaterial.emissive.copy(currentColor);
    coreMaterial.color.copy(currentColor);
    glowMaterial.color.copy(currentColor);
    coreLight.color.copy(currentColor);
    
    // Pulse light emission intensity over time
    const lightPulseIntensity = 4.0 + Math.sin(elapsed * 4.0) * 1.2 + (roiSpeedModifier * 4.0);
    coreLight.intensity = lightPulseIntensity;

    // Rotate particle system slowly
    particles.rotation.y = elapsed * 0.025;

    // Render using post-processing effect composer
    composer.render();
}

animate();

// ============ RESIZE HANDLER ============
function handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    composer.setSize(width, height);

    particleMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
}

window.addEventListener('resize', handleResize);

// ============ MOUSE PARALLAX ============
let mouseX = 0;
let mouseY = 0;
let targetMouseX = 0;
let targetMouseY = 0;

document.addEventListener('mousemove', (e) => {
    // Reduce parallax impact on mobile layouts
    const multiplier = isMobile() ? 0.05 : 0.4;
    targetMouseX = (e.clientX / window.innerWidth - 0.5) * multiplier;
    targetMouseY = (e.clientY / window.innerHeight - 0.5) * multiplier;
});

function updateParallax() {
    requestAnimationFrame(updateParallax);
    
    mouseX += (targetMouseX - mouseX) * 0.05;
    mouseY += (targetMouseY - mouseY) * 0.05;

    camera.position.x = mouseX;
    camera.position.y = -mouseY;
    camera.lookAt(0, 0, 0);
}

updateParallax();

// ============ FAQ ACCORDION ============
const faqItems = document.querySelectorAll('.faq-item');
faqItems.forEach(item => {
    const button = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');
    
    button.addEventListener('click', () => {
        const isExpanded = button.getAttribute('aria-expanded') === 'true';
        
        // Close other items
        faqItems.forEach(otherItem => {
            if (otherItem !== item) {
                const otherButton = otherItem.querySelector('.faq-question');
                const otherAnswer = otherItem.querySelector('.faq-answer');
                otherButton.setAttribute('aria-expanded', 'false');
                otherAnswer.style.maxHeight = null;
                otherItem.classList.remove('active');
            }
        });
        
        // Toggle current item
        button.setAttribute('aria-expanded', !isExpanded);
        item.classList.toggle('active');
        
        if (!isExpanded) {
            answer.style.maxHeight = answer.scrollHeight + 'px';
        } else {
            answer.style.maxHeight = null;
        }
    });
});
