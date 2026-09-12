import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import css from "../../index.css?raw";
import { expect, it } from "vitest";
import { Button } from "./button";

it.each(["filled", "accent", "destructive"] as const)("%s consumes matching foregrounds in each enabled state", variant => {
  const family = variant === "filled" ? "control" : variant === "accent" ? "action" : "destructive";
  const markup = renderToStaticMarkup(createElement(Button, { variant, children: "Test" }));
  for (const state of ["hover", "pressed"]) {
    const interaction = state === "pressed" ? "active" : state;
    expect(markup).toContain(`${interaction}:bg-ui-${family}-${state}`);
    expect(markup).toContain(`${interaction}:text-ui-${family}-${state}-fg`);
  }
});

it("scopes disabled and focus changes to custom themes", () => {
  for (const variant of ["filled", "accent", "destructive"]) {
    expect(css).toContain(`:root[data-ui-stock="false"] .ui-button[data-variant="${variant}"]:disabled`);
  }
  expect(css).toContain(':root[data-ui-stock="false"] .ui-button:focus-visible');
  expect(css).toContain('--tw-ring-offset-color: var(--local-background)');
});

it("gives enabled buttons a pointer cursor", () => {
  const markup = renderToStaticMarkup(createElement(Button, { children: "Test" }));
  expect(markup).toContain("cursor-pointer");
  expect(markup).toContain("disabled:cursor-default");
  expect(css).toContain("button:enabled:not([data-disabled])");
  expect(css).toContain("cursor: pointer");
});
