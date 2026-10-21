// C-15 messages.js: the load error with Try Again (FR-6.1), the No data
// messages (FR-6.2, FR-3.4) and a polite announcer for selection changes.

import { h } from './format.js';

export const LOAD_ERROR_TEXT = 'The map could not be loaded. Check your connection and try again.';
export const NO_COUNTY_RESULTS_TEXT = 'No results for this county in the selected election.';
export const NO_RACE_RESULTS_TEXT = 'No data: no votes are recorded in this race for this county.';

/**
 * Error box shown in the map area. role="alert" announces it once when it
 * appears; Try Again calls onRetry, which re-requests the files.
 */
export function createLoadError(container, { onRetry }) {
  let box = null;
  let busy = false;

  function show() {
    if (box) return;
    const button = h('button', { type: 'button', class: 'button button-primary' }, 'Try Again');
    button.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      button.disabled = true;
      button.textContent = 'Trying again…';
      try {
        await onRetry();
      } finally {
        busy = false;
        if (box && box.contains(button)) {
          button.disabled = false;
          button.textContent = 'Try Again';
          button.focus();
        }
      }
    });
    box = h('div', { class: 'load-error', role: 'alert' }, h('p', {}, LOAD_ERROR_TEXT), button);
    container.append(box);
  }

  function hide() {
    if (!box) return;
    const hadFocus = box.contains(document.activeElement);
    box.remove();
    box = null;
    if (hadFocus) container.closest('section')?.querySelector('h2')?.focus();
  }

  return {
    render(state) {
      if (state.loadStatus === 'error') show();
      else if (state.loadStatus === 'ready') hide();
    },
  };
}

/** A visually hidden polite live region for short confirmations. */
export function createAnnouncer(root = document.body) {
  const region = h('p', { class: 'visually-hidden', 'aria-live': 'polite', 'aria-atomic': 'true' });
  root.append(region);
  let timer = 0;
  return {
    say(text) {
      clearTimeout(timer);
      region.textContent = '';
      // A short gap makes screen readers treat a repeated message as new.
      timer = setTimeout(() => {
        region.textContent = text;
      }, 60);
    },
  };
}
