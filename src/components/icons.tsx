import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 22) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });

export const IconCamera = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
export const IconMic = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);
export const IconStop = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
  </svg>
);
export const IconSend = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z" />
  </svg>
);
export const IconHome = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8Z" />
  </svg>
);
export const IconTag = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3 12V4h8l9 9-8 8-9-9Z" />
    <circle cx="7.5" cy="8.5" r="1.5" />
  </svg>
);
export const IconChat = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
  </svg>
);
export const IconLock = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
export const IconCheck = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const IconCart = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2" />
    <circle cx="9" cy="20" r="1.3" />
    <circle cx="17" cy="20" r="1.3" />
  </svg>
);
export const IconStore = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 9.5 5.5 4h13L20 9.5M4 9.5c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 2 3s2-1.3 2-3c0 1.7 1.3 3 3 3s3-1.3 3-3M5 12.5V20h14v-7.5M10 20v-4h4v4" />
  </svg>
);
export const IconQr = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />
  </svg>
);
export const IconSpark = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </svg>
);
export const IconClock = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" />
  </svg>
);
