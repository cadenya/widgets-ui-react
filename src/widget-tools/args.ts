/**
 * Parsers for the Widgets Tools template's tool arguments. Arguments come from
 * the model and arrive untyped, so every field is checked; anything malformed
 * is dropped rather than rendered.
 */

export interface AskUserOption {
  value: string;
  text: string;
  description?: string;
}

export type AskUserElement =
  | {
      type: "radio_buttons" | "checkboxes";
      options: AskUserOption[];
      initialOptions: string[];
      allowOther: boolean;
    }
  | {
      type: "plain_text_input";
      placeholder?: string;
      initialValue?: string;
      multiline: boolean;
      maxLength?: number;
    };

export interface AskUserQuestion {
  id: string;
  question: string;
  header?: string;
  context?: string;
  element: AskUserElement;
}

export interface DetailsField {
  label: string;
  value: string;
}

export interface DetailsAction {
  text: string;
  url: string;
  style: "default" | "primary" | "danger";
}

export interface DisplayDetailsArgs {
  title: string;
  url?: string;
  subtitle?: string;
  description?: string;
  image?: { url: string; altText: string };
  fields: DetailsField[];
  actions: DetailsAction[];
}

type Obj = Record<string, unknown>;

function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Returns the URL when it is an absolute http(s) URL, so a model-supplied
 * `javascript:` or `data:` URL never reaches an href or src.
 */
export function safeUrl(value: unknown): string | undefined {
  const raw = str(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function parseOptions(value: unknown): AskUserOption[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const options: AskUserOption[] = [];
  for (const item of value) {
    if (!isObject(item)) continue;
    const optionValue = str(item.value);
    const text = str(item.text) ?? optionValue;
    if (!optionValue || !text || seen.has(optionValue)) continue;
    seen.add(optionValue);
    options.push({ value: optionValue, text, description: str(item.description) });
  }
  return options;
}

function parseElement(value: unknown): AskUserElement | undefined {
  if (!isObject(value)) return undefined;
  switch (value.type) {
    case "radio_buttons":
    case "checkboxes": {
      const options = parseOptions(value.options);
      const allowOther = value.allow_other === true;
      // A choice needs something to choose between.
      if (options.length + (allowOther ? 1 : 0) < 2) return undefined;
      const known = new Set(options.map((option) => option.value));
      const initial = Array.isArray(value.initial_options)
        ? value.initial_options.filter((v): v is string => typeof v === "string" && known.has(v))
        : [];
      return {
        type: value.type,
        options,
        allowOther,
        initialOptions: value.type === "radio_buttons" ? initial.slice(0, 1) : initial,
      };
    }
    case "plain_text_input": {
      const maxLength =
        typeof value.max_length === "number" && value.max_length >= 1
          ? Math.floor(value.max_length)
          : undefined;
      return {
        type: "plain_text_input",
        placeholder: str(value.placeholder),
        initialValue: str(value.initial_value),
        multiline: value.multiline === true,
        maxLength,
      };
    }
    default:
      return undefined;
  }
}

/**
 * Parses cdy_widget_ask_user arguments into renderable questions: malformed questions and
 * repeated ids are skipped, and at most four are kept. Returns null when
 * nothing usable remains (including when arguments are not exposed at all).
 */
export function parseAskUserArgs(args: unknown): AskUserQuestion[] | null {
  if (!isObject(args) || !Array.isArray(args.questions)) return null;
  const seen = new Set<string>();
  const questions: AskUserQuestion[] = [];
  for (const item of args.questions) {
    if (!isObject(item)) continue;
    const id = str(item.id);
    const question = str(item.question);
    const element = parseElement(item.element);
    if (!id || !question || !element || seen.has(id)) continue;
    seen.add(id);
    questions.push({ id, question, header: str(item.header), context: str(item.context), element });
    if (questions.length === 4) break;
  }
  return questions.length > 0 ? questions : null;
}

/**
 * Parses cdy_widget_display_details arguments. Returns null without a title; drops URLs
 * that are not http(s), fields without a label and value, and actions
 * without text and a safe URL.
 */
export function parseDisplayDetailsArgs(args: unknown): DisplayDetailsArgs | null {
  if (!isObject(args)) return null;
  const title = str(args.title);
  if (!title) return null;

  const imageUrl = isObject(args.image) ? safeUrl(args.image.url) : undefined;
  const fields = Array.isArray(args.fields)
    ? args.fields
        .filter(isObject)
        .map((field) => ({ label: str(field.label), value: str(field.value) }))
        .filter((field): field is DetailsField => !!field.label && !!field.value)
        .slice(0, 10)
    : [];
  const actions = Array.isArray(args.actions)
    ? args.actions
        .filter(isObject)
        .map((action) => ({
          text: str(action.text),
          url: safeUrl(action.url),
          style:
            action.style === "primary" || action.style === "danger"
              ? action.style
              : ("default" as const),
        }))
        .filter((action): action is DetailsAction => !!action.text && !!action.url)
        .slice(0, 3)
    : [];

  return {
    title,
    url: safeUrl(args.url),
    subtitle: str(args.subtitle),
    description: str(args.description),
    image:
      imageUrl && isObject(args.image)
        ? { url: imageUrl, altText: str(args.image.alt_text) ?? "" }
        : undefined,
    fields,
    actions,
  };
}
