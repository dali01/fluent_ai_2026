"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; content: string };

export function PortalChat({ token }: { token: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [requested, setRequested] = useState(false);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = () => {
    const question = input.trim();
    if (!question || pending) return;
    const nextTurns: Turn[] = [...turns, { role: "user", content: question }];
    setTurns(nextTurns);
    setInput("");

    startTransition(async () => {
      try {
        const res = await fetch("/api/portal/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, messages: nextTurns.slice(-10) }),
        });
        const data = (await res.json().catch(() => null)) as {
          answer?: string;
          error?: string;
        } | null;
        setTurns([
          ...nextTurns,
          {
            role: "assistant",
            content:
              (res.ok ? data?.answer : data?.error) ??
              "Something went wrong — please try again.",
          },
        ]);
      } catch {
        setTurns([
          ...nextTurns,
          {
            role: "assistant",
            content: "Something went wrong — please try again.",
          },
        ]);
      }
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="size-4 text-primary" aria-hidden />
          Questions about your quotes or orders?
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {turns.length > 0 ? (
          <div
            ref={scrollRef}
            className="flex max-h-80 flex-col gap-2 overflow-y-auto"
          >
            {turns.map((turn, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
                  turn.role === "user"
                    ? "self-end bg-primary text-primary-foreground"
                    : "self-start bg-muted",
                )}
              >
                {turn.content}
              </div>
            ))}
            {pending ? (
              <div className="self-start rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                Thinking…
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ask about the status, contents or pricing of your quotes and orders
            — answers come from your live order data. For changes to an order,
            contact us directly.
          </p>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. When is my business-card order due?"
            maxLength={2000}
            disabled={pending}
          />
          <Button type="submit" size="icon" disabled={pending || !input.trim()}>
            <Send aria-hidden />
            <span className="sr-only">Send</span>
          </Button>
        </form>

        {/* Separate from the chat on purpose: the assistant only
            explains, so asking for something new is an explicit act. */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={pending || input.trim().length < 10}
            onClick={() =>
              startTransition(async () => {
                const res = await fetch("/api/portal/request-quote", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ token, message: input.trim() }),
                });
                if (res.ok) {
                  setInput("");
                  setRequested(true);
                } else {
                  setTurns((t) => [
                    ...t,
                    {
                      role: "assistant",
                      content:
                        "Sorry — I couldn't pass that on. Please contact us directly.",
                    },
                  ]);
                }
              })
            }
          >
            <FileText aria-hidden /> Request a quote for this
          </Button>
          <span className="text-xs text-muted-foreground">
            {requested
              ? "Sent — the shop will price it and come back to you."
              : "Describe what you need above, then send it over as a quote request."}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
