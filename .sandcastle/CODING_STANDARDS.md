# Coding Standards

## Mobile / responsive

### Breakpoints

| Token   | Range         | Typical query                    |
|---------|---------------|----------------------------------|
| phone   | <= 600px      | `@media (max-width: 600px)`      |
| tablet  | 601 - 1023px  | `@media (max-width: 1023px)`     |
| desktop | >= 1024px     | `@media (min-width: 1024px)`     |

Use these breakpoints consistently. Do not introduce ad-hoc values (480px, 639px, 768px, etc.) without a documented reason.

### Viewport height

Use `100dvh` (dynamic viewport height) instead of `100vh` for full-height containers. `dvh` accounts for the iOS Safari URL bar and other dynamic browser chrome. No fallback is needed (supported since Safari 15.4).

### Safe-area insets

Full-bleed components that touch the top or bottom edge of the screen must respect the device safe area:

```css
/* Header / top bar */
padding-top: max(<existing-pad>, env(safe-area-inset-top));

/* Bottom of page-level containers */
padding-bottom: env(safe-area-inset-bottom);
```

This ensures content clears the Dynamic Island (top) and home indicator (bottom) on notched iPhones. The `viewport-fit=cover` meta tag in `index.html` enables these environment variables.
