import { useEffect, useCallback, useRef, useState } from 'react';

export interface KeyboardNavigationOptions {
  onEscape?: () => void;
  onEnter?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  onTab?: () => void;
  onShiftTab?: () => void;
  onCtrlEnter?: () => void;
  onCtrlK?: () => void;
  onCtrlS?: () => void;
  disabled?: boolean;
}

export const useKeyboardNavigation = (options: KeyboardNavigationOptions = {}) => {
  const {
    onEscape,
    onEnter,
    onArrowUp,
    onArrowDown,
    onArrowLeft,
    onArrowRight,
    onTab,
    onShiftTab,
    onCtrlEnter,
    onCtrlK,
    onCtrlS,
    disabled = false
  } = options;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (disabled) return;

    const { key, ctrlKey, metaKey, shiftKey } = event;
    const isModifierPressed = ctrlKey || metaKey;

    switch (key) {
      case 'Escape':
        if (onEscape) {
          event.preventDefault();
          onEscape();
        }
        break;
      case 'Enter':
        if (isModifierPressed && onCtrlEnter) {
          event.preventDefault();
          onCtrlEnter();
        } else if (!isModifierPressed && onEnter) {
          event.preventDefault();
          onEnter();
        }
        break;
      case 'ArrowUp':
        if (onArrowUp) {
          event.preventDefault();
          onArrowUp();
        }
        break;
      case 'ArrowDown':
        if (onArrowDown) {
          event.preventDefault();
          onArrowDown();
        }
        break;
      case 'ArrowLeft':
        if (onArrowLeft) {
          event.preventDefault();
          onArrowLeft();
        }
        break;
      case 'ArrowRight':
        if (onArrowRight) {
          event.preventDefault();
          onArrowRight();
        }
        break;
      case 'Tab':
        if (shiftKey && onShiftTab) {
          event.preventDefault();
          onShiftTab();
        } else if (!shiftKey && onTab) {
          event.preventDefault();
          onTab();
        }
        break;
      case 'k':
        if (isModifierPressed && onCtrlK) {
          event.preventDefault();
          onCtrlK();
        }
        break;
      case 's':
        if (isModifierPressed && onCtrlS) {
          event.preventDefault();
          onCtrlS();
        }
        break;
    }
  }, [disabled, onEscape, onEnter, onArrowUp, onArrowDown, onArrowLeft, onArrowRight, onTab, onShiftTab, onCtrlEnter, onCtrlK, onCtrlS]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { handleKeyDown };
};

export interface MessageNavigationState {
  focusedMessageIndex: number;
  focusedResumeIndex: number;
  isNavigatingMessages: boolean;
}

export const useMessageNavigation = (messagesLength: number) => {
  const [focusedMessageIndex, setFocusedMessageIndex] = useState(-1);
  const [focusedResumeIndex, setFocusedResumeIndex] = useState(-1);
  const [isNavigatingMessages, setIsNavigatingMessages] = useState(false);
  const [searchMode, setSearchMode] = useState(false);

  const startNavigation = useCallback(() => {
    setIsNavigatingMessages(true);
    setFocusedMessageIndex(messagesLength - 1); // Start with the last message
  }, [messagesLength]);

  const stopNavigation = useCallback(() => {
    setIsNavigatingMessages(false);
    setFocusedMessageIndex(-1);
    setFocusedResumeIndex(-1);
  }, []);

  const navigateUp = useCallback(() => {
    if (!isNavigatingMessages) return;
    setFocusedMessageIndex(prev => Math.max(0, prev - 1));
  }, [isNavigatingMessages]);

  const navigateDown = useCallback(() => {
    if (!isNavigatingMessages) return;
    setFocusedMessageIndex(prev => Math.min(messagesLength - 1, prev + 1));
  }, [isNavigatingMessages, messagesLength]);

  const navigateResumeLeft = useCallback(() => {
    if (!isNavigatingMessages) return;
    setFocusedResumeIndex(prev => Math.max(-1, prev - 1));
  }, [isNavigatingMessages]);

  const navigateResumeRight = useCallback((maxResumeIndex: number) => {
    if (!isNavigatingMessages) return;
    setFocusedResumeIndex(prev => Math.min(maxResumeIndex - 1, prev + 1));
  }, [isNavigatingMessages]);

  const toggleSearchMode = useCallback(() => {
    setSearchMode(prev => !prev);
  }, []);

  return {
    focusedMessageIndex,
    focusedResumeIndex,
    isNavigatingMessages,
    searchMode,
    startNavigation,
    stopNavigation,
    navigateUp,
    navigateDown,
    navigateResumeLeft,
    navigateResumeRight,
    toggleSearchMode,
    setSearchMode
  };
};

export const useFocusManagement = () => {
  const focusableElementsRef = useRef<HTMLElement[]>([]);

  const updateFocusableElements = useCallback(() => {
    const focusableSelectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"]):not([disabled])'
    ].join(', ');

    focusableElementsRef.current = Array.from(
      document.querySelectorAll(focusableSelectors)
    ) as HTMLElement[];
  }, []);

  const focusElement = useCallback((index: number) => {
    updateFocusableElements();
    const element = focusableElementsRef.current[index];
    if (element) {
      element.focus();
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [updateFocusableElements]);

  const focusNext = useCallback(() => {
    updateFocusableElements();
    const currentIndex = focusableElementsRef.current.findIndex(el => el === document.activeElement);
    const nextIndex = (currentIndex + 1) % focusableElementsRef.current.length;
    focusElement(nextIndex);
  }, [focusElement, updateFocusableElements]);

  const focusPrevious = useCallback(() => {
    updateFocusableElements();
    const currentIndex = focusableElementsRef.current.findIndex(el => el === document.activeElement);
    const prevIndex = currentIndex === 0 ? focusableElementsRef.current.length - 1 : currentIndex - 1;
    focusElement(prevIndex);
  }, [focusElement, updateFocusableElements]);

  return {
    focusElement,
    focusNext,
    focusPrevious,
    updateFocusableElements
  };
};
