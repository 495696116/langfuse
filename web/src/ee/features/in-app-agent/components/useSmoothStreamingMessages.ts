import { useEffect, useRef, useState } from "react";

import type { AgUiMessage } from "@/src/ee/features/in-app-agent/schema";

const FRAME_DURATION_MS = 40;
const INITIAL_CHUNK_INTERVAL_MS = 300;
const MIN_CHUNK_INTERVAL_MS = 80;
const MAX_CHUNK_INTERVAL_MS = 1_000;
const MIN_SMOOTHED_GRAPHEMES = 16;
const CHUNK_INTERVAL_WEIGHT = 0.3;

const graphemeSegmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

export function useSmoothStreamingMessages(
  messages: AgUiMessage[],
  liveMessageVersion: number,
  shouldFlush: boolean,
) {
  const [displayedMessages, setDisplayedMessages] = useState(messages);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const controllerRef = useRef<ReturnType<
    typeof createSmoothStreamingController
  > | null>(null);
  const lastLiveMessageVersionRef = useRef(liveMessageVersion);
  const shouldFlushRef = useRef(shouldFlush);
  shouldFlushRef.current = shouldFlush;

  useEffect(() => {
    const controller =
      controllerRef.current ??
      createSmoothStreamingController({
        initialMessages: messages,
        onActiveMessageChanged: setActiveMessageId,
        onMessagesChanged: setDisplayedMessages,
        shouldAnimate: () =>
          !shouldFlushRef.current &&
          document.visibilityState === "visible" &&
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
    controllerRef.current = controller;
    const shouldStartAnimation =
      liveMessageVersion !== lastLiveMessageVersionRef.current;
    lastLiveMessageVersionRef.current = liveMessageVersion;
    controller.enqueue(messages, shouldStartAnimation);
  }, [liveMessageVersion, messages]);

  useEffect(() => {
    return () => {
      controllerRef.current?.cancel();
      controllerRef.current = null;
    };
  }, []);

  return {
    isAnimating: activeMessageId !== null,
    messages:
      activeMessageId === null
        ? displayedMessages
        : displayedMessages.map((message) =>
            message.id === activeMessageId
              ? { ...message, isLoading: true }
              : message,
          ),
  };
}

function createSmoothStreamingController({
  initialMessages,
  onActiveMessageChanged,
  onMessagesChanged,
  shouldAnimate,
}: {
  initialMessages: AgUiMessage[];
  onActiveMessageChanged: (messageId: string | null) => void;
  onMessagesChanged: (messages: AgUiMessage[]) => void;
  shouldAnimate: () => boolean;
}) {
  let displayedMessages = snapshotMessages(initialMessages);
  let targetMessages = displayedMessages;
  let timeoutId: number | null = null;
  let isCancelled = false;
  let expectedChunkIntervalMs = INITIAL_CHUNK_INTERVAL_MS;
  let animationDeadline = 0;
  let lastContentAt: number | null = null;
  let lastContentMessageId: string | null = null;
  let activeMessageId: string | null = null;

  const setActiveMessageId = (messageId: string | null) => {
    if (activeMessageId === messageId) {
      return;
    }

    activeMessageId = messageId;
    onActiveMessageChanged(messageId);
  };

  const clearScheduledFrame = () => {
    if (timeoutId === null) {
      return;
    }

    window.clearTimeout(timeoutId);
    timeoutId = null;
  };

  const stopListeningForVisibilityChanges = () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };

  const publish = (messages: AgUiMessage[]) => {
    displayedMessages = messages;
    onMessagesChanged(messages);
  };

  const finish = () => {
    clearScheduledFrame();
    stopListeningForVisibilityChanges();
    if (displayedMessages !== targetMessages) {
      publish(targetMessages);
    }
    setActiveMessageId(null);
  };

  const emitFrame = () => {
    timeoutId = null;
    if (isCancelled) {
      return;
    }

    if (!shouldAnimate()) {
      finish();
      return;
    }

    const pendingText = findPendingText(displayedMessages, targetMessages);
    if (!pendingText) {
      finish();
      return;
    }

    setActiveMessageId(pendingText.targetMessage.id);

    const remainingGraphemes = splitGraphemes(
      pendingText.targetText.slice(pendingText.displayedText.length),
    );
    const remainingDurationMs = Math.max(
      FRAME_DURATION_MS,
      animationDeadline - Date.now(),
    );
    const graphemesThisFrame = Math.max(
      1,
      Math.ceil(
        remainingGraphemes.length * (FRAME_DURATION_MS / remainingDurationMs),
      ),
    );
    const nextText =
      pendingText.displayedText +
      remainingGraphemes.slice(0, graphemesThisFrame).join("");

    if (nextText === pendingText.targetText) {
      finish();
      return;
    }

    publish(
      targetMessages
        .slice(0, pendingText.targetIndex)
        .concat(withTextContent(pendingText.targetMessage, nextText)),
    );
    timeoutId = window.setTimeout(emitFrame, FRAME_DURATION_MS);
  };

  function handleVisibilityChange() {
    if (!shouldAnimate()) {
      finish();
    }
  }

  const startListeningForVisibilityChanges = () => {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  };

  const enqueue = (messages: AgUiMessage[], shouldStartAnimation: boolean) => {
    if (isCancelled) {
      return;
    }

    const nextMessages = snapshotMessages(messages);
    const appendedText = findAppendedText(targetMessages, nextMessages);
    targetMessages = nextMessages;

    if (!appendedText) {
      if (timeoutId === null) {
        finish();
      }
      return;
    }

    const now = Date.now();
    if (
      lastContentAt !== null &&
      lastContentMessageId === appendedText.messageId
    ) {
      const observedIntervalMs = Math.min(
        MAX_CHUNK_INTERVAL_MS,
        Math.max(MIN_CHUNK_INTERVAL_MS, now - lastContentAt),
      );
      expectedChunkIntervalMs =
        expectedChunkIntervalMs * (1 - CHUNK_INTERVAL_WEIGHT) +
        observedIntervalMs * CHUNK_INTERVAL_WEIGHT;
    } else {
      expectedChunkIntervalMs = INITIAL_CHUNK_INTERVAL_MS;
    }

    lastContentAt = now;
    lastContentMessageId = appendedText.messageId;
    animationDeadline = now + expectedChunkIntervalMs;

    if (
      !shouldAnimate() ||
      (timeoutId === null &&
        (!shouldStartAnimation ||
          splitGraphemes(appendedText.delta).length < MIN_SMOOTHED_GRAPHEMES))
    ) {
      finish();
      return;
    }

    if (timeoutId === null) {
      startListeningForVisibilityChanges();
      emitFrame();
    }
  };

  const cancel = () => {
    if (isCancelled) {
      return;
    }

    isCancelled = true;
    clearScheduledFrame();
    stopListeningForVisibilityChanges();
    setActiveMessageId(null);
  };

  return { enqueue, cancel };
}

function snapshotMessages(messages: AgUiMessage[]) {
  return messages.map((message) => {
    if (message.role !== "assistant" || !message.toolCalls) {
      return { ...message };
    }

    return {
      ...message,
      toolCalls: message.toolCalls.map((toolCall) => ({
        ...toolCall,
        function: { ...toolCall.function },
      })),
    };
  });
}

function getSmoothableText(message: AgUiMessage | undefined) {
  if (message?.role === "reasoning") {
    return message.content;
  }

  if (message?.role === "assistant" && typeof message.content === "string") {
    return message.content;
  }

  return null;
}

function findAppendedText(
  previousMessages: AgUiMessage[],
  nextMessages: AgUiMessage[],
) {
  const previousTextByMessageId = new Map(
    previousMessages.map((message) => [message.id, getSmoothableText(message)]),
  );

  for (const nextMessage of nextMessages) {
    const nextText = getSmoothableText(nextMessage);
    if (nextText === null) {
      continue;
    }

    const previousText = previousTextByMessageId.get(nextMessage.id);
    const existingText = previousText ?? "";
    if (
      nextText.startsWith(existingText) &&
      nextText.length > existingText.length
    ) {
      return {
        messageId: nextMessage.id,
        delta: nextText.slice(existingText.length),
      };
    }
  }

  return null;
}

function findPendingText(
  displayedMessages: AgUiMessage[],
  targetMessages: AgUiMessage[],
) {
  const displayedTextByMessageId = new Map(
    displayedMessages.map((message) => [
      message.id,
      getSmoothableText(message),
    ]),
  );

  for (const [targetIndex, targetMessage] of targetMessages.entries()) {
    const targetText = getSmoothableText(targetMessage);
    if (targetText === null) {
      continue;
    }

    const displayedText = displayedTextByMessageId.get(targetMessage.id) ?? "";
    if (
      targetText.startsWith(displayedText) &&
      targetText.length > displayedText.length
    ) {
      return {
        targetIndex,
        targetMessage,
        targetText,
        displayedText,
      };
    }
  }

  return null;
}

function withTextContent(message: AgUiMessage, content: string) {
  if (message.role === "reasoning" || message.role === "assistant") {
    return { ...message, content };
  }

  throw new Error("Only assistant and reasoning messages can be smoothed");
}

function splitGraphemes(value: string) {
  if (!graphemeSegmenter) {
    return Array.from(value);
  }

  return Array.from(graphemeSegmenter.segment(value), ({ segment }) => segment);
}
