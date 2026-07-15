import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";

import type { AgUiMessage } from "@/src/ee/features/in-app-agent/schema";
import { useSmoothStreamingMessages } from "./useSmoothStreamingMessages";

const userMessage = {
  id: "user",
  role: "user",
  content: "Investigate this",
} satisfies AgUiMessage;

const assistantMessage = (content: string) =>
  ({
    id: "assistant",
    role: "assistant",
    content,
  }) satisfies AgUiMessage;

const reasoningMessage = (content: string) =>
  ({
    id: "reasoning",
    role: "reasoning",
    content,
  }) satisfies AgUiMessage;

let prefersReducedMotion = false;

function TestConsumer({
  liveMessageVersion,
  messages,
}: {
  liveMessageVersion: number;
  messages: AgUiMessage[];
}) {
  const smoothStreaming = useSmoothStreamingMessages(
    messages,
    liveMessageVersion,
    false,
  );
  const latestMessage = smoothStreaming.messages.at(-1);
  const isLoading =
    latestMessage &&
    "isLoading" in latestMessage &&
    latestMessage.isLoading === true;

  return (
    <>
      <span data-testid="content">
        {typeof latestMessage?.content === "string"
          ? latestMessage.content
          : ""}
      </span>
      <span data-testid="animating">
        {smoothStreaming.isAnimating ? "true" : "false"}
      </span>
      <span data-testid="loading">{isLoading ? "true" : "false"}</span>
      <span data-testid="message-ids">
        {smoothStreaming.messages.map((message) => message.id).join(",")}
      </span>
    </>
  );
}

describe("useSmoothStreamingMessages", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    prefersReducedMotion = false;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: prefersReducedMotion })),
    );
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps display pacing and loading state local to the transcript", () => {
    const content =
      "This coarse canonical update should be revealed smoothly by the transcript only.";
    const assistantMessage = (isLoading: boolean) =>
      ({
        id: "assistant",
        role: "assistant",
        content,
        isLoading,
      }) satisfies AgUiMessage & { isLoading: boolean };
    const { rerender } = render(
      <StrictMode>
        <TestConsumer liveMessageVersion={0} messages={[userMessage]} />
      </StrictMode>,
    );

    rerender(
      <StrictMode>
        <TestConsumer
          liveMessageVersion={1}
          messages={[userMessage, assistantMessage(true)]}
        />
      </StrictMode>,
    );

    expect(screen.getByTestId("content")).not.toHaveTextContent(content);
    expect(screen.getByTestId("animating")).toHaveTextContent("true");

    rerender(
      <StrictMode>
        <TestConsumer
          liveMessageVersion={1}
          messages={[userMessage, assistantMessage(false)]}
        />
      </StrictMode>,
    );

    expect(screen.getByTestId("loading")).toHaveTextContent("true");

    act(() => {
      vi.runAllTimers();
    });

    expect(screen.getByTestId("content")).toHaveTextContent(content);
    expect(screen.getByTestId("animating")).toHaveTextContent("false");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("does not animate hydrated history", () => {
    const content =
      "This historical assistant response is long but should appear immediately.";
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={0}
        messages={[
          {
            id: "assistant",
            role: "assistant",
            content,
          },
        ]}
      />,
    );

    expect(screen.getByTestId("content")).toHaveTextContent(content);
    expect(screen.getByTestId("animating")).toHaveTextContent("false");
  });

  it("animates a live message that completes in one update", () => {
    const content =
      "This final response arrived atomically but should still be displayed smoothly.";
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[
          userMessage,
          {
            id: "assistant",
            role: "assistant",
            content,
          },
        ]}
      />,
    );

    expect(screen.getByTestId("content")).not.toHaveTextContent(content);
    expect(screen.getByTestId("animating")).toHaveTextContent("true");

    act(() => {
      vi.runAllTimers();
    });

    expect(screen.getByTestId("content")).toHaveTextContent(content);
    expect(screen.getByTestId("animating")).toHaveTextContent("false");
  });

  it("smooths reasoning without splitting graphemes", () => {
    const content =
      "Checking 👨‍👩‍👧‍👦 cafe\u0301 latency across the selected traces.";
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, reasoningMessage(content)]}
      />,
    );

    const renderedContent = [screen.getByTestId("content").textContent];
    while (vi.getTimerCount() > 0) {
      act(() => {
        vi.advanceTimersByTime(40);
      });
      renderedContent.push(screen.getByTestId("content").textContent);
    }

    expect(renderedContent).not.toContain("Checking 👨");
    expect(renderedContent).not.toContain("Checking 👨‍");
    expect(screen.getByTestId("content")).toHaveTextContent(content);
  });

  it("detects content when the agent mutates a message in place", () => {
    const reasoning = reasoningMessage("");
    const messages = [userMessage, reasoning];
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={messages} />,
    );

    reasoning.content =
      "The agent mutated this reasoning object with a large chunk instead of replacing it.";
    rerender(<TestConsumer liveMessageVersion={1} messages={messages} />);

    expect(screen.getByTestId("content")).not.toHaveTextContent(
      reasoning.content,
    );

    act(() => {
      vi.runAllTimers();
    });
    expect(screen.getByTestId("content")).toHaveTextContent(reasoning.content);
  });

  it("applies small chunks immediately", () => {
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, assistantMessage("Short")]}
      />,
    );

    expect(screen.getByTestId("content")).toHaveTextContent("Short");
    expect(screen.getByTestId("animating")).toHaveTextContent("false");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("holds structural messages behind buffered text", () => {
    const content =
      "First reveal this complete explanation before showing the tool result that follows it.";
    const toolMessage = {
      id: "tool-result",
      role: "tool",
      toolCallId: "tool-call",
      content: "done",
    } satisfies AgUiMessage;
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, assistantMessage(content)]}
      />,
    );
    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, assistantMessage(content), toolMessage]}
      />,
    );

    expect(screen.getByTestId("message-ids")).not.toHaveTextContent(
      "tool-result",
    );

    act(() => {
      vi.runAllTimers();
    });
    expect(screen.getByTestId("message-ids")).toHaveTextContent(
      "user,assistant,tool-result",
    );
  });

  it("does not animate for reduced-motion users", () => {
    prefersReducedMotion = true;
    const content =
      "This large chunk should be applied at once when reduced motion is enabled.";
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, assistantMessage(content)]}
      />,
    );

    expect(screen.getByTestId("content")).toHaveTextContent(content);
    expect(screen.getByTestId("animating")).toHaveTextContent("false");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("flushes active animation when animation becomes disabled", () => {
    const content =
      "This active animation should finish as soon as its browser tab becomes hidden.";
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, assistantMessage(content)]}
      />,
    );
    prefersReducedMotion = true;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByTestId("content")).toHaveTextContent(content);
    expect(screen.getByTestId("animating")).toHaveTextContent("false");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels animation when the transcript unmounts", () => {
    const content =
      "This buffered response must not update the transcript after it unmounts.";
    const { rerender, unmount } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, assistantMessage(content)]}
      />,
    );
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
