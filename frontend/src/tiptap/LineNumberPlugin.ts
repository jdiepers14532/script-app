/**
 * Line numbers in the left gutter — pure CSS solution.
 *
 * Uses CSS counters + ::after pseudo-element on every 5th block child.
 * No ProseMirror plugin needed — just the CSS class `has-line-numbers`
 * on the .ProseMirror element toggles visibility.
 */

export const LINE_NUMBER_CSS = `
.ProseMirror.has-line-numbers {
  padding-left: 44px !important;
  counter-reset: ln;
}
.ProseMirror.has-line-numbers > * {
  counter-increment: ln;
  position: relative;
}
.ProseMirror.has-line-numbers > *:nth-child(5n)::after {
  content: counter(ln);
  position: absolute;
  left: -40px;
  top: 0;
  width: 32px;
  text-align: right;
  font-family: 'Courier Prime', 'Courier New', monospace;
  font-size: 9px;
  line-height: inherit;
  color: var(--text-secondary);
  pointer-events: none;
  user-select: none;
}
`
