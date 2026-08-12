import type {
  ActionLocatorDescriptor,
  ActionLocatorResult,
  BrowserProvider,
  BrowserSession,
  FieldInteractionDescriptor,
  FormLocatorDescriptor,
  NavigationResult,
  StageTransitionDescriptor,
  StageTransitionEvidence,
  ExpectedActionRequest,
  PortalActionObservation,
  CapturedPortalDocument,
} from './browser-provider';

export type PortalFlowOutcome = 'COMPLETED' | 'ACCEPTED_PENDING' | 'ALREADY_COMPLETED' | 'REJECTED' | 'UNKNOWN_OUTCOME';

export type PortalStageField = {
  inputKey: string;
  locator: FieldInteractionDescriptor;
};

export type PortalStageDescriptor<ActionKey extends string = string> = {
  key: string;
  readySelector?: string;
  fields: readonly PortalStageField[];
  form: FormLocatorDescriptor;
  actionKey: ActionKey;
  transition: StageTransitionDescriptor;
  expectedActionRequest?: ExpectedActionRequest;
};

export interface StagedPortalAdapter<ActionKey extends string = string> {
  readonly adapterKey: string;
  readonly portalUrl: string;
  readonly allowedDomains: readonly string[];
  getStages(): readonly PortalStageDescriptor<ActionKey>[];
  getActionLocator(actionKey: ActionKey): ActionLocatorDescriptor;
  resolveOutcome(stageKey: string, evidence: StageTransitionEvidence): PortalFlowOutcome | undefined;
  resolveActionOutcome?(stageKey: string, observation: PortalActionObservation): PortalFlowOutcome | undefined;
}

export type PortalStageExecution = {
  stageKey: string;
  actionResolution: ActionLocatorResult;
  transitionEvidence: StageTransitionEvidence;
  documents: readonly CapturedPortalDocument[];
  responseSummary?: unknown;
};

export type PortalFlowResult = {
  adapterKey: string;
  outcome: PortalFlowOutcome;
  navigation: NavigationResult;
  stages: readonly PortalStageExecution[];
};

export class PortalStageFlowEngine {
  async execute<ActionKey extends string>(
    provider: BrowserProvider,
    session: BrowserSession,
    adapter: StagedPortalAdapter<ActionKey>,
    input: Readonly<Record<string, string>>,
    timeoutMs: number,
    onObservation?: (observation: PortalActionObservation) => Promise<void>,
  ): Promise<PortalFlowResult> {
    const navigation = await provider.navigate(session, adapter.portalUrl);
    const executions: PortalStageExecution[] = [];
    let outcome: PortalFlowOutcome = 'UNKNOWN_OUTCOME';

    for (const stage of adapter.getStages()) {
      if (stage.readySelector) await provider.waitForPortalReady(session, stage.readySelector, timeoutMs);
      for (const field of stage.fields) {
        const value = input[field.inputKey];
        if (value === undefined) throw new MissingPortalInputError(stage.key, field.inputKey);
        await provider.interactWithField(session, field.locator, value);
      }
      const observation = await provider.observeAction(session, {
        stageKey: stage.key,
        actionKey: String(stage.actionKey),
        form: stage.form,
        action: adapter.getActionLocator(stage.actionKey),
        ...(stage.expectedActionRequest ? { expectedRequest: stage.expectedActionRequest } : {}),
        currentStageFields: stage.fields.map((field) => field.locator),
        transition: stage.transition,
        timeoutMs,
      });
      await onObservation?.(observation);
      const actionResolution = observation.actionResolution;
      const actionOutcome = adapter.resolveActionOutcome?.(stage.key, observation);
      if (actionOutcome) {
        outcome = actionOutcome;
        break;
      }
      if (!observation.transitionEvidence) throw new PortalActionObservationError(observation);
      const transitionEvidence = observation.transitionEvidence;
      executions.push({
        stageKey: stage.key, actionResolution, transitionEvidence, documents: observation.documents ?? [],
        ...(observation.request.responseSummary !== undefined ? { responseSummary: observation.request.responseSummary } : {}),
      });
      outcome = adapter.resolveOutcome(stage.key, transitionEvidence) ?? outcome;
    }

    return { adapterKey: adapter.adapterKey, outcome, navigation, stages: executions };
  }
}

export class PortalActionObservationError extends Error {
  readonly code = 'PORTAL_ACTION_OBSERVATION_FAILED';
  constructor(readonly observation: PortalActionObservation) {
    super(observation.outcome);
  }
}

export class MissingPortalInputError extends Error {
  readonly code = 'PORTAL_INPUT_MISSING';

  constructor(readonly stageKey: string, readonly inputKey: string) {
    super(`Missing input ${inputKey} for portal stage ${stageKey}`);
  }
}
