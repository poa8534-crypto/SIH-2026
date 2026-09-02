/**
 * Enter and the Send button must agree about when sending is allowed.
 *
 * The button carried `disabled={!typed.trim() || thinking}`; the Enter handler
 * carried no guard at all. `send()` itself only refuses an empty message, so
 * Enter was a way round the `thinking` half: a second press while a turn was
 * still in flight started another one on the same session_id. That is not a
 * hypothetical — a field supervisor on a slow connection, seeing nothing happen
 * yet, presses Enter again.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TextInput } from '../pages/field/TextInput';

function setup(disabled: boolean) {
  const onSend = vi.fn();
  render(
    <TextInput
      value="Backfilling near pipe rack finished today"
      onChange={() => {}}
      onSend={onSend}
      disabled={disabled}
      grow={false}
    />,
  );
  return { onSend, input: screen.getByPlaceholderText('Or type your update') };
}

describe('TextInput send guards', () => {
  it('Enter sends when sending is allowed', () => {
    const { onSend, input } = setup(false);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('Enter does nothing while a turn is already in flight', () => {
    const { onSend, input } = setup(true);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('repeated Enter cannot queue a second turn on the same session', () => {
    const { onSend, input } = setup(true);
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('other keys never send', () => {
    const { onSend, input } = setup(false);
    for (const key of ['a', 'Escape', 'Tab', ' ']) {
      fireEvent.keyDown(input, { key });
    }
    expect(onSend).not.toHaveBeenCalled();
  });

  it('the Send button honours the same guard', () => {
    const { onSend } = setup(true);
    fireEvent.click(screen.getByLabelText('Send'));
    expect(onSend).not.toHaveBeenCalled();
  });
});
