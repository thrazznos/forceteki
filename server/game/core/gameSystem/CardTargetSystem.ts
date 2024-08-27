import type { AbilityContext } from '../ability/AbilityContext';
import { Card } from '../card/Card';
import { CardType, CardTypeFilter, EffectName, Location, WildcardCardType } from '../Constants';
import { GameSystem as GameSystem, IGameSystemProperties as IGameSystemProperties } from './GameSystem';
import { GameEvent } from '../event/GameEvent';
import * as EnumHelpers from '../utils/EnumHelpers';
import { UpgradeCard } from '../card/UpgradeCard';
// import { LoseFateAction } from './LoseFateAction';

export interface ICardTargetSystemProperties extends IGameSystemProperties {
    target?: Card | Card[];
}

/**
 * A {@link GameSystem} which targets a card or cards for its effect
 */
// TODO: mixin for Action types (CardAction, PlayerAction)?
// TODO: could we remove the default generic parameter so that all child classes are forced to declare it
export abstract class CardTargetSystem<TProperties extends ICardTargetSystemProperties = ICardTargetSystemProperties> extends GameSystem<TProperties> {
    /** The set of card types that can be legally targeted by the system. Defaults to {@link WildcardCardType.Any} unless overriden. */
    protected readonly targetTypeFilter: CardTypeFilter[] = [WildcardCardType.Any];

    protected override isTargetTypeValid(target: any): boolean {
        if (!(target instanceof Card)) {
            return false;
        }

        return EnumHelpers.cardTypeMatches((target as Card).type, this.targetTypeFilter);
    }

    public override generateEventsForAllTargets(context: AbilityContext, additionalProperties = {}): GameEvent[] {
        const events: GameEvent[] = [];

        const { target } = this.generatePropertiesFromContext(context, additionalProperties);
        for (const card of target as Card[]) {
            let allCostsPaid = true;
            const additionalCosts = card
                .getEffectValues(EffectName.UnlessActionCost)
                .filter((properties) => properties.actionName === this.name);

            if (context.player && context.ability && context.ability.targetResolvers && context.ability.targetResolvers.length > 0) {
                // let targetForCost = [card];

                // if (context.targets.challenger && context.targets.duelTarget) {
                //     //duels act weird, we need to handle targeting differently for them to work
                //     let duelTargets = Object.values<BaseCard | Array<BaseCard>>(context.targets).flat();
                //     targetForCost = targetForCost.concat(duelTargets);
                // }

                // targetForCost.forEach((costTarget) => {
                //     const targetingCosts = context.player.getTargetingCost(context.source, costTarget);
                //     //we should only resolve the targeting costs once per card per target, even if it has multiple abilities - so track who we've already paid to target
                //     if (
                //         (!context.costs ||
                //             !context.costs.targetingCostPaid ||
                //             !context.costs.targetingCostPaid.includes(costTarget)) &&
                //         targetingCosts > 0
                //     ) {
                //         if (!context.costs.targetingCostPaid) {
                //             context.costs.targetingCostPaid = [];
                //         }
                //         context.costs.targetingCostPaid.push(costTarget);
                //         let properties = { amount: targetingCosts, target: context.player };
                //         let cost = new LoseFateAction(properties);
                //         if (cost.canAffect(context.player, context)) {
                //             context.game.addMessage(
                //                 '{0} pays {1} fate in order to target {2}',
                //                 context.player,
                //                 targetingCosts,
                //                 costTarget.name
                //             );
                //             cost.resolve(context.player, context);
                //         } else {
                //             context.game.addMessage(
                //                 '{0} cannot pay {1} fate in order to target {2}',
                //                 context.player,
                //                 targetingCosts,
                //                 costTarget.name
                //             );
                //             allCostsPaid = false;
                //         }
                //     }
                // });
            }

            if (additionalCosts.length > 0) {
                for (const properties of additionalCosts) {
                    context.game.queueSimpleStep(() => {
                        let cost = properties.cost;
                        if (typeof cost === 'function') {
                            cost = cost(card);
                        }
                        if (cost.hasLegalTarget(context)) {
                            cost.resolve(card, context);
                            context.game.addMessage(
                                '{0} {1} in order to {2}',
                                card.controller,
                                cost.getEffectMessage(context),
                                this.getEffectMessage(context, additionalProperties)
                            );
                        } else {
                            allCostsPaid = false;
                            context.game.addMessage(
                                '{0} cannot pay the additional cost required to {1}',
                                card.controller,
                                this.getEffectMessage(context, additionalProperties)
                            );
                        }
                    }, 'resolve card targeting costs');
                }
                context.game.queueSimpleStep(() => {
                    if (allCostsPaid) {
                        events.push(this.generateEvent(card, context, additionalProperties));
                    }
                }, 'push card target event if targeting cost paid');
            } else {
                if (allCostsPaid) {
                    events.push(this.generateEvent(card, context, additionalProperties));
                }
            }
        }

        return events;
    }

    public override checkEventCondition(event: any, additionalProperties = {}): boolean {
        return this.canAffect(event.card, event.context, additionalProperties);
    }

    public override addPropertiesToEvent(event, card: Card, context: AbilityContext, additionalProperties = {}): void {
        super.addPropertiesToEvent(event, card, context, additionalProperties);
        event.card = card;
    }

    public override isEventFullyResolved(event, card: Card, context: AbilityContext, additionalProperties): boolean {
        return event.card === card && super.isEventFullyResolved(event, card, context, additionalProperties);
    }

    protected override defaultTargets(context: AbilityContext): Card[] {
        return [context.source];
    }

    protected addLeavesPlayPropertiesToEvent(event, card: Card, context: AbilityContext, additionalProperties): void {
        const properties = this.generatePropertiesFromContext(context, additionalProperties) as any;
        super.updateEvent(event, card, context, additionalProperties);
        event.destination = properties.destination || Location.Discard;

        event.createContingentEvents = () => {
            const contingentEvents = [];

            // add events to defeat any upgrades attached to this card. the events will be added as "contingent events"
            // in the event window, so they'll resolve in the same window but after the primary event
            for (const upgrade of (event.card.upgrades ?? []) as UpgradeCard[]) {
                if (EnumHelpers.isArena(upgrade.location)) {
                    const attachmentEvent = context.game.actions
                        .defeat()
                        .generateEvent(upgrade, context.game.getFrameworkContext());
                    attachmentEvent.order = event.order - 1;
                    const previousCondition = attachmentEvent.condition;
                    attachmentEvent.condition = (attachmentEvent) =>
                        previousCondition(attachmentEvent) && upgrade.parentCard === event.card;
                    attachmentEvent.isContingent = true;
                    contingentEvents.push(attachmentEvent);
                }
            }

            return contingentEvents;
        };

        // TODO GAR SAXON: the L5R 'ancestral' keyword behaves exactly like Gar's deployed ability, we can reuse this code for him
        // event.preResolutionEffect = () => {
        //     event.cardStateWhenLeftPlay = event.card.createSnapshot();
        //     if (event.card.isAncestral() && event.isContingent) {
        //         event.destination = Location.Hand;
        //         context.game.addMessage(
        //             '{0} returns to {1}'s hand due to its Ancestral keyword',
        //             event.card,
        //             event.card.owner
        //         );
        //     }
        // };
    }

    protected leavesPlayEventHandler(event, additionalProperties = {}): void {
        if (!event.card.owner.isLegalLocationForCardType(event.card.type, event.destination)) {
            event.card.game.addMessage(
                '{0} is not a legal location for {1} and it is discarded',
                event.destination,
                event.card
            );
            event.destination = Location.Deck;
        }
        event.card.owner.moveCard(event.card, event.destination, event.options || {});
    }
}