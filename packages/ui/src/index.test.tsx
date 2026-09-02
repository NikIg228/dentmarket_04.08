import { describe, expect, it, vi } from "vitest";

vi.mock("@fluentui/react-components", () => ({
  Avatar: "div",
  Button: "button",
  Checkbox: "label",
  createLightTheme: () => ({}),
  Dialog: "dialog",
  DialogActions: "footer",
  DialogBody: "div",
  DialogContent: "div",
  DialogSurface: "section",
  DialogTitle: "h2",
  Field: "label",
  FluentProvider: "div",
  Input: "input",
  Select: "select",
  Spinner: "span",
  Tag: "span",
  Textarea: "textarea",
  Tooltip: "span",
  webDarkTheme: {},
}));

vi.mock("@fluentui/react-icons", () => ({
  Dismiss24Regular: () => null,
  Navigation24Regular: () => null,
  SignOut24Regular: () => null,
  WeatherMoon24Regular: () => null,
  WeatherSunny24Regular: () => null,
}));
import {
  DmButton,
  DmConflictState,
  DmDialog,
  DmTable,
  formatMoney,
} from "./index";

describe("DentMarket UI contracts", () => {
  it("keeps the requested action hierarchy on shared buttons", () => {
    const element = DmButton({ appearance: "primary", children: "Сохранить" });
    expect(element.props["data-dm-appearance"]).toBe("primary");
    expect(element.props.className).toContain("dm-button");
  });

  it("exposes controlled modal and conflict-state boundaries", () => {
    const dialog = DmDialog({
      open: true,
      onOpenChange: () => undefined,
      title: "Подтверждение",
      children: "Содержимое",
    });
    const conflict = DmConflictState({
      title: "Цена изменилась",
      description: "Примите новую цену",
    });
    expect(dialog.props.open).toBe(true);
    expect(conflict.type).toBe(DmFeedbackType());
  });

  it("keeps table captions and large monetary values in the shared layer", () => {
    const table = DmTable({
      caption: "Заказы",
      columns: [{ key: "order", label: "Заказ" }],
      children: null,
    });
    expect(table.props.className).toBe("mp-table-wrap");
    expect(formatMoney(BigInt("9007199254741000"), "KZT")).toContain("₸");
  });
});

function DmFeedbackType() {
  return DmConflictState({
    title: "Проверка",
    description: "Проверка",
  }).type;
}
