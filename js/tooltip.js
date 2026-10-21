// C-7 tooltip.js: shows the county name and its value beside the pointer or the
// focused county (FR-1.4). It stays open while the pointer is over it, closes
// with Escape, and stays dismissed until the pointer or focus moves to another
// county (WCAG 1.4.13: hoverable, dismissible, persistent).

import { h } from './format.js';

const HIDE_DELAY_MS = 250;
const GAP = 10;

export function createTooltip(frame) {
  const name = h('strong', { class: 'tooltip-name' });
  const value = h('span', { class: 'tooltip-value' });
  const element = h('div', { class: 'map-tooltip', role: 'tooltip', id: 'map-tooltip', hidden: true }, name, value);
  frame.append(element);

  let hideTimer = 0;
  let currentKey = null;
  let dismissedKey = null;

  element.addEventListener('pointerenter', cancelHide);
  element.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') scheduleHide();
  });

  function cancelHide() {
    clearTimeout(hideTimer);
    hideTimer = 0;
  }

  function scheduleHide() {
    cancelHide();
    hideTimer = setTimeout(hide, HIDE_DELAY_MS);
  }

  function hide() {
    cancelHide();
    element.hidden = true;
    currentKey = null;
  }

  /** Places the tooltip near (x, y), given in frame coordinates, inside the frame. */
  function place(x, y, below = true) {
    const frameWidth = frame.clientWidth;
    const frameHeight = frame.clientHeight;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    let left = x + GAP;
    if (left + width > frameWidth - 4) left = x - GAP - width;
    left = Math.max(4, Math.min(left, frameWidth - width - 4));
    let top = below ? y + GAP : y - GAP - height;
    if (top + height > frameHeight - 4) top = y - GAP - height;
    if (top < 4) top = Math.min(y + GAP, frameHeight - height - 4);
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(Math.max(4, top))}px`;
  }

  function fill(key, content) {
    name.textContent = content.name;
    value.textContent = content.value;
    currentKey = key;
    element.hidden = false;
  }

  return {
    element,
    isVisible: () => !element.hidden,
    currentKey: () => currentKey,
    cancelHide,
    scheduleHide,
    hide,
    /** Shows at a client (viewport) point, e.g. the pointer. */
    showAtPoint(key, content, clientX, clientY) {
      if (key === dismissedKey) return;
      dismissedKey = null;
      cancelHide();
      fill(key, content);
      const box = frame.getBoundingClientRect();
      place(clientX - box.left, clientY - box.top);
    },
    /** Shows next to an element, e.g. the county that has keyboard focus. */
    showForElement(key, content, target) {
      if (key !== dismissedKey) dismissedKey = null;
      if (key === dismissedKey) return;
      cancelHide();
      fill(key, content);
      const box = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      place(rect.left + rect.width / 2 - box.left, rect.top - box.top, false);
    },
    /** Updates the text in place when the view changes under an open tooltip. */
    refresh(key, content) {
      if (!element.hidden && key === currentKey) {
        name.textContent = content.name;
        value.textContent = content.value;
      }
    },
    /** Escape: hide, and keep hidden for this county until something else is pointed at. */
    dismiss() {
      dismissedKey = currentKey;
      hide();
    },
    /** Forget a dismissal, e.g. when the pointer leaves the county. */
    resetDismissal(key) {
      if (key === undefined || key === dismissedKey) dismissedKey = null;
    },
  };
}
