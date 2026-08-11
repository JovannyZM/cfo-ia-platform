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
} from './browser-provider';

export type PortalFlowOutcome = 'COMPLETED' | 'ACCEPTED_PENDING' | 'REJECTED' | 'UNKNOWN_OUTCOME';

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
};

export interface StagedPortalAdapter<ActionKey extends string = string> {
  readonly adapterKey: string;
  readonly portalUrl: string;
  readonly allowedDomains: readonly string[];
  getStages(): readonly PortalStageDescriptor<ActionKey>[];
  getActionLocator(actionKey: ActionKey): ActionLocatorDescriptor;
  resolveOutcome(stageKey: string, evidence: StageTransitionEvidence): PortalFlowOutcome | undefined;
}

export type PortalStageExecution = {
  stageKey: string;
  actionResolution: ActionLocatorResult;
  transitionEvidence: StageTransitionEvidence;
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
      const actionResolution = await provider.clickAction(
        session,
        stage.form,
        adapter.getActionLocator(stage.actionKey),
      );
      const transitionEvidence = await provider.waitForStageTransition(session, stage.transition, timeoutMs);
      executions.push({ stageKey: stage.key, actionResolution, transitionEvidence });
      outcome = adapter.resolveOutcome(stage.key, transitionEvidence) ?? outcome;
    }

    return { adapterKey: adapter.adapterKey, outcome, navigation, stages: executions };
  }
}

export class MissingPortalInputError extends Error {
  readonly code = 'PORTAL_INPUT_MISSING';

  constructor(readonly stageKey: string, readonly inputKey: string) {
    super(`Missing input ${inputKey} for portal stage ${stageKey}`);
  }
}
