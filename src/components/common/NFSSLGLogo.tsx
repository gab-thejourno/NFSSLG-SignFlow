import React from 'react';

interface NFSSLGLogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
}

export const NFSSLGLogo: React.FC<NFSSLGLogoProps> = ({
  className = 'w-10 h-10',
  size,
  showText = false,
}) => {
  const style = size ? { width: size, height: size } : undefined;

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`} style={style}>
      <svg
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full shrink-0 select-none drop-shadow-sm"
      >
        <defs>
          {/* Subtle facet disc gradient */}
          <linearGradient id="nfsslg-inner-bg" x1="120" y1="80" x2="420" y2="440" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor="#f4f7fc" />
            <stop offset="85%" stopColor="#e3ebf7" />
            <stop offset="100%" stopColor="#d5e2f3" />
          </linearGradient>

          {/* Facet polygon gradient */}
          <linearGradient id="nfsslg-facet" x1="256" y1="50" x2="480" y2="280" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#e1eaf7" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#cddcee" stopOpacity="0.1" />
          </linearGradient>

          {/* Golden Sun gradient */}
          <linearGradient id="nfsslg-sun" x1="256" y1="120" x2="256" y2="195" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffea48" />
            <stop offset="40%" stopColor="#f7c014" />
            <stop offset="100%" stopColor="#e59800" />
          </linearGradient>

          {/* Royal Blue emblem gradient */}
          <linearGradient id="nfsslg-blue-grad" x1="256" y1="160" x2="256" y2="380" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1e54b7" />
            <stop offset="35%" stopColor="#14439c" />
            <stop offset="100%" stopColor="#0d317b" />
          </linearGradient>

          {/* Outer Ring gradient */}
          <linearGradient id="nfsslg-ring" x1="70" y1="60" x2="440" y2="460" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0a327e" />
            <stop offset="50%" stopColor="#103e94" />
            <stop offset="100%" stopColor="#082b6e" />
          </linearGradient>

          {/* Drop shadow filter for building and NFSSLG text badge */}
          <filter id="nfsslg-glow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#ffffff" floodOpacity="0.9" />
          </filter>
        </defs>

        {/* 1. Outer Circular Ring */}
        <circle cx="256" cy="256" r="236" fill="url(#nfsslg-ring)" />
        <circle cx="256" cy="256" r="212" fill="url(#nfsslg-inner-bg)" />

        {/* 2. Faceted geometric reflections on inner disc */}
        <polygon points="256,44 468,256 360,400 256,256" fill="url(#nfsslg-facet)" />
        <polygon points="256,44 140,160 256,256" fill="#ffffff" fillOpacity="0.35" />

        {/* 3. The Philippine Sun */}
        <g transform="translate(256, 175)">
          {/* Sun Rays: 8 triple-burst rays */}
          {/* Ray 1: Top (0 deg) */}
          <path d="M-6,-22 L0,-50 L6,-22 Z" fill="url(#nfsslg-sun)" />
          <path d="M-10,-20 L-5,-38 L-2,-21 Z" fill="url(#nfsslg-sun)" />
          <path d="M10,-20 L5,-38 L2,-21 Z" fill="url(#nfsslg-sun)" />

          {/* Ray 2: Top-Right (45 deg) */}
          <g transform="rotate(45)">
            <path d="M-5,-22 L0,-48 L5,-22 Z" fill="url(#nfsslg-sun)" />
            <path d="M-9,-20 L-4,-36 L-2,-21 Z" fill="url(#nfsslg-sun)" />
            <path d="M9,-20 L4,-36 L2,-21 Z" fill="url(#nfsslg-sun)" />
          </g>

          {/* Ray 3: Top-Left (-45 deg) */}
          <g transform="rotate(-45)">
            <path d="M-5,-22 L0,-48 L5,-22 Z" fill="url(#nfsslg-sun)" />
            <path d="M-9,-20 L-4,-36 L-2,-21 Z" fill="url(#nfsslg-sun)" />
            <path d="M9,-20 L4,-36 L2,-21 Z" fill="url(#nfsslg-sun)" />
          </g>

          {/* Ray 4: Right (90 deg) */}
          <g transform="rotate(80)">
            <path d="M-5,-22 L0,-45 L5,-22 Z" fill="url(#nfsslg-sun)" />
            <path d="M-8,-20 L-4,-34 L-2,-21 Z" fill="url(#nfsslg-sun)" />
            <path d="M8,-20 L4,-34 L2,-21 Z" fill="url(#nfsslg-sun)" />
          </g>

          {/* Ray 5: Left (-90 deg) */}
          <g transform="rotate(-80)">
            <path d="M-5,-22 L0,-45 L5,-22 Z" fill="url(#nfsslg-sun)" />
            <path d="M-8,-20 L-4,-34 L-2,-21 Z" fill="url(#nfsslg-sun)" />
            <path d="M8,-20 L4,-34 L2,-21 Z" fill="url(#nfsslg-sun)" />
          </g>

          {/* Sun Core Disc */}
          <circle cx="0" cy="0" r="28" fill="url(#nfsslg-sun)" stroke="#e59800" strokeWidth="1.5" />
        </g>

        {/* 4. Classical Building & Pediment */}
        {/* Pediment Roof (Triangle with classical cornice) */}
        <g id="pediment">
          {/* Triangular Tympanum */}
          <path
            d="M 256 160 L 358 200 L 154 200 Z"
            fill="url(#nfsslg-blue-grad)"
          />
          {/* Pediment Sloped Eaves */}
          <path
            d="M 256 156 L 364 199 L 360 204 L 256 162 L 152 204 L 148 199 Z"
            fill="#2563eb"
            stroke="#103e94"
            strokeWidth="1.5"
          />

          {/* Architrave / Cornice horizontal shelf */}
          <rect x="172" y="200" width="168" height="6" rx="2" fill="#0d317b" />
          <rect x="172" y="206" width="168" height="3" fill="#ffffff" fillOpacity="0.4" />

          {/* Three White Stars on the Pediment */}
          {/* Apex Star */}
          <path
            d="M 256 172 L 258 178 L 264 178 L 259 182 L 261 188 L 256 184 L 251 188 L 253 182 L 248 178 L 254 178 Z"
            fill="#ffffff"
          />
          {/* Left Star */}
          <path
            d="M 224 184 L 225.5 188.5 L 230 188.5 L 226.5 191.5 L 228 196 L 224 193 L 220 196 L 221.5 191.5 L 218 188.5 L 222.5 188.5 Z"
            fill="#ffffff"
          />
          {/* Right Star */}
          <path
            d="M 288 184 L 289.5 188.5 L 294 188.5 L 290.5 191.5 L 292 196 L 288 193 L 284 196 L 285.5 191.5 L 282 188.5 L 286.5 188.5 Z"
            fill="#ffffff"
          />
        </g>

        {/* 5. Five Classical Columns with light core accents */}
        <g id="columns">
          {/* Column 1 */}
          <g transform="translate(186, 209)">
            <rect x="-8" y="0" width="16" height="4" rx="1.5" fill="#14439c" />
            <path d="M-6,4 C-8,16 -5,44 -6,64 L6,64 C5,44 8,16 6,4 Z" fill="#14439c" />
            <path d="M-2,8 C-3,24 -2,48 -2,60 L2,60 C2,48 3,24 2,8 Z" fill="#ffffff" fillOpacity="0.85" />
            <rect x="-8" y="64" width="16" height="4" rx="1.5" fill="#0d317b" />
          </g>

          {/* Column 2 */}
          <g transform="translate(221, 209)">
            <rect x="-8" y="0" width="16" height="4" rx="1.5" fill="#14439c" />
            <path d="M-6,4 C-8,16 -5,44 -6,64 L6,64 C5,44 8,16 6,4 Z" fill="#14439c" />
            <path d="M-2,8 C-3,24 -2,48 -2,60 L2,60 C2,48 3,24 2,8 Z" fill="#ffffff" fillOpacity="0.85" />
            <rect x="-8" y="64" width="16" height="4" rx="1.5" fill="#0d317b" />
          </g>

          {/* Column 3 (Center) */}
          <g transform="translate(256, 209)">
            <rect x="-8" y="0" width="16" height="4" rx="1.5" fill="#14439c" />
            <path d="M-6,4 C-8,16 -5,44 -6,64 L6,64 C5,44 8,16 6,4 Z" fill="#14439c" />
            <path d="M-2,8 C-3,24 -2,48 -2,60 L2,60 C2,48 3,24 2,8 Z" fill="#ffffff" fillOpacity="0.85" />
            <rect x="-8" y="64" width="16" height="4" rx="1.5" fill="#0d317b" />
          </g>

          {/* Column 4 */}
          <g transform="translate(291, 209)">
            <rect x="-8" y="0" width="16" height="4" rx="1.5" fill="#14439c" />
            <path d="M-6,4 C-8,16 -5,44 -6,64 L6,64 C5,44 8,16 6,4 Z" fill="#14439c" />
            <path d="M-2,8 C-3,24 -2,48 -2,60 L2,60 C2,48 3,24 2,8 Z" fill="#ffffff" fillOpacity="0.85" />
            <rect x="-8" y="64" width="16" height="4" rx="1.5" fill="#0d317b" />
          </g>

          {/* Column 5 */}
          <g transform="translate(326, 209)">
            <rect x="-8" y="0" width="16" height="4" rx="1.5" fill="#14439c" />
            <path d="M-6,4 C-8,16 -5,44 -6,64 L6,64 C5,44 8,16 6,4 Z" fill="#14439c" />
            <path d="M-2,8 C-3,24 -2,48 -2,60 L2,60 C2,48 3,24 2,8 Z" fill="#ffffff" fillOpacity="0.85" />
            <rect x="-8" y="64" width="16" height="4" rx="1.5" fill="#0d317b" />
          </g>
        </g>

        {/* 6. Stepped Base Bars (Philippine Colors: Yellow Plinth & Red Accent) */}
        {/* Blue Upper Base Plinth */}
        <rect x="170" y="277" width="172" height="5" rx="1.5" fill="#0d317b" />

        {/* Yellow Plinth Bar */}
        <rect x="154" y="282" width="204" height="6.5" rx="3" fill="#fab814" stroke="#d49a0e" strokeWidth="0.8" />

        {/* Red Accent Bar */}
        <rect x="140" y="289" width="232" height="7.5" rx="3.5" fill="#d91b24" stroke="#b01018" strokeWidth="0.8" />

        {/* 7. The NFSSLG Badge Text */}
        <g id="nfsslg-text">
          {/* White outline/shadow layer to create embossed badge effect */}
          <text
            x="256"
            y="360"
            textAnchor="middle"
            fontFamily="'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"
            fontWeight="900"
            fontSize="68"
            letterSpacing="-1px"
            fill="#ffffff"
            stroke="#ffffff"
            strokeWidth="10"
            strokeLinejoin="round"
          >
            NFSSLG
          </text>
          {/* Deep Royal Blue Main Text */}
          <text
            x="256"
            y="360"
            textAnchor="middle"
            fontFamily="'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"
            fontWeight="900"
            fontSize="68"
            letterSpacing="-1px"
            fill="url(#nfsslg-blue-grad)"
          >
            NFSSLG
          </text>
        </g>
      </svg>

      {showText && (
        <div className="flex flex-col">
          <span className="text-base font-extrabold tracking-tight text-white leading-tight">
            NFSSLG SignFlow
          </span>
          <span className="text-[10px] tracking-wider uppercase font-semibold text-blue-300">
            National Federation of SSLG
          </span>
        </div>
      )}
    </div>
  );
};
