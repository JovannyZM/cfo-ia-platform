export type BrowserSessionOptions = {
  allowedDomains: readonly string[];
  timeoutMs: number;
};

export type BrowserSession = { readonly id: string };

export type NavigationResult = {
  finalUrl: string;
  observedDomains: readonly string[];
  blockedDomains: readonly string[];
};

export type PageMetadata = {
  title: string;
  url: string;
};

export type HttpResponseMatcher = { method: string; pathname: string };
export type ObservedHttpResponse = {
  requestObserved: boolean;
  responseReceived: boolean;
  status: number | null;
  durationMs: number | null;
};

export type VisibleField = {
  tag: 'input' | 'select' | 'textarea';
  type?: string;
  name?: string;
  label?: string;
  placeholder?: string;
};

export type VisibleElements = {
  fields: readonly VisibleField[];
  buttons: readonly string[];
  headings: readonly string[];
  statusMessages: readonly string[];
  captchaDetected: boolean;
  loginDetected: boolean;
  legalMessages: readonly string[];
};

export interface PortalReadyAdapter {
  getReadySelector(): string;
}

export type FormLocatorDescriptor = {
  anchorLabel?: string;
  anchorInputSelector?: string;
  containerSelector: string;
  expectedVisibleCount: number;
};

export type FieldInteractionDescriptor = {
  css?: string;
  label?: string;
  name?: string;
  control: 'text' | 'select';
  expectedVisibleCount: number;
  events?: readonly ('input' | 'change' | 'blur')[];
};

export type StageTransitionDescriptor = {
  visibleFields?: readonly Pick<FieldInteractionDescriptor, 'css' | 'label' | 'name'>[];
  visibleText?: string;
  match: 'all' | 'any';
};

export type StageTransitionEvidence = {
  matchedFields: number;
  expectedFields: number;
  textMatched: boolean;
};

export type ActionLocatorDescriptor = {
  css?: string;
  role?: 'button' | 'link';
  name?: string;
  text?: string;
  scope?: string;
  visibleOnly?: boolean;
  expectedCount: number;
};

export type ActionLocatorResult = {
  anchorTotalCount: number;
  anchorVisibleCount: number;
  formVisibleCount: number;
  totalCount: number;
  visibleCount: number;
  containerSelector: string;
};

export interface PortalActionAdapter<ActionKey extends string = string> extends PortalReadyAdapter {
  getFormLocator(): FormLocatorDescriptor;
  getActionLocator(actionKey: ActionKey): ActionLocatorDescriptor;
}

export interface BrowserProvider {
  createSession(options: BrowserSessionOptions): Promise<BrowserSession>;
  closeSession(session: BrowserSession): Promise<void>;
  navigate(session: BrowserSession, url: string): Promise<NavigationResult>;
  waitForPortalReady(session: BrowserSession, selector: string, timeoutMs: number): Promise<void>;
  getPageMetadata(session: BrowserSession): Promise<PageMetadata>;
  captureScreenshot(session: BrowserSession, reference: string): Promise<string>;
  extractVisibleElements(session: BrowserSession): Promise<VisibleElements>;
  fillField(session: BrowserSession, name: string, value: string): Promise<void>;
  interactWithField(session: BrowserSession, descriptor: FieldInteractionDescriptor, value: string): Promise<void>;
  clickAction(
    session: BrowserSession,
    formDescriptor: FormLocatorDescriptor,
    actionDescriptor: ActionLocatorDescriptor,
  ): Promise<ActionLocatorResult>;
  waitForHttpResponse(
    session: BrowserSession,
    matcher: HttpResponseMatcher,
    timeoutMs: number,
  ): Promise<ObservedHttpResponse>;
  waitForStageTransition(
    session: BrowserSession,
    descriptor: StageTransitionDescriptor,
    timeoutMs: number,
  ): Promise<StageTransitionEvidence>;
  waitForSettled(session: BrowserSession): Promise<void>;
}

export const BROWSER_PROVIDER = Symbol('BROWSER_PROVIDER');

export function isAllowedPortalUrl(rawUrl: string, allowedDomains: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return allowedDomains.some((domain) => {
    const normalized = domain.trim().toLowerCase().replace(/^\./, '');
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}
