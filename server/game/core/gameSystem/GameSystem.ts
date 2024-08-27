import type { AbilityContext } from '../ability/AbilityContext';
import type { Card } from '../card/Card';
import { CardType, EventName, Stage } from '../Constants';
import { GameEvent } from '../event/GameEvent';
import type Player from '../Player';
import type PlayerOrCardAbility from '../ability/PlayerOrCardAbility';
import type Game from '../Game';

type PlayerOrCard = Player | Card;

export interface IGameSystemProperties {
    target?: PlayerOrCard | PlayerOrCard[];
    cannotBeCancelled?: boolean;
    optional?: boolean;
    parentAction?: GameSystem<IGameSystemProperties>;
    // TODO: make sure that existing systems handle 'isCost' check correctly
    isCost?: boolean;
}

// TODO: see which base classes can be made abstract
/**
 * Base class for making structured changes to game state. Almost all effects, actions,
 * costs, etc. should use a {@link GameSystem} object to impact the game state.
 *
 * @template TProperties Property class to use for configuring the behavior of the system's execution
 */
// TODO: could we remove the default generic parameter so that all child classes are forced to declare it
export abstract class GameSystem<TProperties extends IGameSystemProperties = IGameSystemProperties> {
    public readonly name: string = ''; // TODO: should these be abstract?
    public readonly costDescription: string = '';
    public readonly effectDescription: string = '';

    protected readonly propertyFactory?: (context?: AbilityContext) => TProperties;
    protected readonly properties?: TProperties;
    protected readonly eventName: EventName = EventName.Unnamed;
    protected readonly defaultProperties: IGameSystemProperties = { cannotBeCancelled: false, optional: false };
    protected getDefaultTargets: (context: AbilityContext) => any = (context) => this.defaultTargets(context);

    protected abstract isTargetTypeValid(target: any): boolean;

    /**
     * Constructs a {@link GameSystem} with a parameter that is either:
     * 1. Preset properties in a {@link TProperties}, which will be set to {@link GameSystem.properties}.
     * 2. A function for generating properties from an {@link AbilityContext} provided at system resolution time,
     * which represents the context of the {@link PlayerOrCardAbility} that is executing this system.
     * This is set to {@link GameSystem.propertyFactory}.
     */
    public constructor(propertiesOrPropertyFactory: TProperties | ((context?: AbilityContext) => TProperties)) {
        if (typeof propertiesOrPropertyFactory === 'function') {
            this.propertyFactory = propertiesOrPropertyFactory;
        } else {
            this.properties = propertiesOrPropertyFactory;
        }
    }

    /**
     * Method for handling the execution of the {@link GameSystem}. This is where the system's effect is applied to the game state.
     * @param context Context of ability being executed
     * @param additionalProperties Any additional properties to extend the default ones with
     */
    public abstract eventHandler(event: GameEvent, additionalProperties: any): void;

    /**
     * Composes a property object for configuring the {@link GameSystem}'s execution using the following sources, in order of decreasing priority:
     * - `this.properties ?? this.propertyFactory(context)`
     * - `additionalProperties` parameter
     * - `this.defaultProperties`
     * - a default `properties.target` value set to `this.getDefaultTargets(context)`
     * @param context Context of ability being executed
     * @param additionalProperties Any additional properties on top of the default ones
     * @returns An object of the `GameSystemProperties` template type
     */
    public generatePropertiesFromContext(context: AbilityContext, additionalProperties = {}): TProperties {
        const properties = Object.assign(
            { target: this.getDefaultTargets(context) },
            this.defaultProperties,
            additionalProperties,
            this.properties ?? this.propertyFactory?.(context) // ?? {} // TODO: remove this comment once we're sure it's not needed
        );
        if (!Array.isArray(properties.target)) {
            properties.target = [properties.target];
        }
        properties.target = properties.target.filter(Boolean);
        return properties;
    }

    public getCostMessage(context: AbilityContext): undefined | [string, any[]] {
        return [this.costDescription, []];
    }

    public getEffectMessage(context: AbilityContext, additionalProperties = {}): [string, any[]] {
        const { target } = this.generatePropertiesFromContext(context, additionalProperties);
        return [this.effectDescription, [target]];
    }

    // TODO: is there a type we can provide for 'target'? Is it more than just players and cards?
    /**
     * Evaluates whether the {@link GameSystem}'s execution can legally affect the passed target
     * @param target Target under consideration
     * @param context Context of ability being executed
     * @param additionalProperties Any additional properties to extend the default ones with
     * @returns True if the target is legal for the system, false otherwise
     */
    public canAffect(target: any, context: AbilityContext, additionalProperties = {}): boolean {
        const { cannotBeCancelled } = this.generatePropertiesFromContext(context, additionalProperties);

        return (
            this.isTargetTypeValid(target) &&
            !context.gameActionsResolutionChain.includes(this) &&
            ((context.stage === Stage.EffectTmp && cannotBeCancelled) || !target.hasRestriction(this.name, context))
        );
    }

    /**
     * Evaluates whether any of the provided targets for this {@link GameSystem} are legal for this system to act on
     * given the current game state. See {@link GameSystem.generatePropertiesFromContext} for details on target generation.
     * @param context Context of ability being executed
     * @param additionalProperties Any additional properties to extend the default ones with
     * @returns True if any of the candidate targets are legal, false otherwise
     */
    public hasLegalTarget(context: AbilityContext, additionalProperties = {}): boolean {
        for (const candidateTarget of this.targets(context, additionalProperties)) {
            if (this.canAffect(candidateTarget, context, additionalProperties)) {
                return true;
            }
        }
        return false;
    }


    /**
     * Evaluates whether all of the provided targets for this {@link GameSystem} are legal for this system to act on
     * given the current game state. See {@link GameSystem.generatePropertiesFromContext} for details on target generation.
     * @param context Context of ability being executed
     * @param additionalProperties Any additional properties to extend the default ones with
     * @returns True if all of the candidate targets are legal, false otherwise
     */
    public allTargetsLegal(context: AbilityContext, additionalProperties = {}): boolean {
        for (const candidateTarget of this.targets(context, additionalProperties)) {
            if (!this.canAffect(candidateTarget, context, additionalProperties)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Generates a list of {@link GameEvent} objects that will apply the effects of this system to the game state
     * by generating one event per target in `context.targets`.
     * The events must be emitted using an {@link EventWindow}, typically via {@link Game.openEventWindow}.
     * @param context Context of ability being executed
     * @param additionalProperties Any additional properties to extend the default ones with
     */
    public generateEventsForAllTargets(context: AbilityContext, additionalProperties = {}): GameEvent[] {
        const events: GameEvent[] = [];
        for (const target of this.targets(context, additionalProperties)) {
            if (this.canAffect(target, context, additionalProperties)) {
                events.push(this.generateEvent(target, context, additionalProperties));
            }
        }
        return events;
    }

    /**
     * Generates one {@link GameEvent} object that will apply the effects of this system to the game state
     * for the specified target.
     * The event must be emitted using an {@link EventWindow}, typically via {@link Game.openEventWindow}.
     * @param target Target to apply the system's effects to
     * @param context Context of ability being executed
     * @param additionalProperties Any additional properties to extend the default ones with
     */
    public generateEvent(target: any, context: AbilityContext, additionalProperties = {}): GameEvent {
        const event = this.createEvent(target, context, additionalProperties);
        this.updateEvent(event, target, context, additionalProperties);
        return event;
    }

    /**
     * Overrides the default {@link GameSystem.getDefaultTargets} method used by the {@link GameSystem} to extract
     * default targets from an {@link AbilityContext} if an explicit target is not provided at system execution time
     */
    public setDefaultTargetFn(func: (context: AbilityContext) => any): void {
        this.getDefaultTargets = func;
    }

    /**
     * Resolves the effects of the effects of the system on game state by generating the necessary events and
     * opening a window to resolve them with {@link Game.openEventWindow}.
     */
    public resolve(
        target: undefined | PlayerOrCard | PlayerOrCard[],
        context: AbilityContext
    ): void {
        if (target) {
            this.setDefaultTargetFn(() => target);
        }
        const events = this.generateEventsForAllTargets(context);
        context.game.queueSimpleStep(() => context.game.openEventWindow(events), `openEventWindow for '${this}'`);
    }

    public checkEventCondition(event: GameEvent, additionalProperties = {}): boolean {
        return true;
    }

    public isEventFullyResolved(event: GameEvent, target: any, context: AbilityContext, additionalProperties = {}): boolean {
        return !event.cancelled && event.name === this.eventName;
    }

    public isOptional(context: AbilityContext, additionalProperties = {}): boolean {
        return this.generatePropertiesFromContext(context, additionalProperties).optional ?? false;
    }

    public hasTargetsChosenByInitiatingPlayer(context: AbilityContext, additionalProperties = {}): boolean {
        return false;
    }

    protected addPropertiesToEvent(event: any, target: any, context: AbilityContext, additionalProperties = {}): void {
        event.context = context;
    }

    /**
     * Create a very basic blank event object. Important properties must be added via {@link GameSystem.updateEvent}.
     */
    protected createEvent(target: any, context: AbilityContext, additionalProperties): GameEvent {
        const { cannotBeCancelled } = this.generatePropertiesFromContext(context, additionalProperties);
        const event = new GameEvent(EventName.Unnamed, { cannotBeCancelled });
        event.checkFullyResolved = (eventAtResolution) =>
            this.isEventFullyResolved(eventAtResolution, target, context, additionalProperties);
        return event;
    }

    /**
     * Writes the important properties of this system onto the passed event object. Only used internally by
     * systems during event generation.
     */
    protected updateEvent(event: GameEvent, target: any, context: AbilityContext, additionalProperties = {}): void {
        event.name = this.eventName;
        this.addPropertiesToEvent(event, target, context, additionalProperties);
        event.replaceHandler((event) => this.eventHandler(event, additionalProperties));
        event.condition = () => this.checkEventCondition(event, additionalProperties);
    }

    /**
     * Method for evaluating default targets from an {@link AbilityContext} in case explicit targets aren't provided
     * at execution time. Returns `[]` by default, will typically be overridden with a more specific method using
     * {@link GameSystem.setDefaultTargetFn} by the caller if intended to be used.
     * @param context Context of ability being executed
     * @returns List of default targets extracted from {@link context} (`[]` by default)
     */
    protected defaultTargets(context: AbilityContext): any[] {
        return [];
    }

    /**
     * Determines what the candidate targets of this {@link GameSystem} are given the context and properties.
     * See {@link GameSystem.generatePropertiesFromContext} for details on target generation.
     * @param context Context of ability being executed
     * @param additionalProperties Any additional properties to extend the default ones with
     * @returns The default target(s) of this {@link GameSystem}
     */
    private targets(context: AbilityContext, additionalProperties = {}) {
        return this.generatePropertiesFromContext(context, additionalProperties).target as PlayerOrCard[];
    }

    public toString() {
        return `'GameSystem: ${this.name}'`;
    }
}