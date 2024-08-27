import { Card } from '../card/Card';
import { CardType, CardTypeFilter, Location, LocationFilter, WildcardCardType, WildcardLocation } from '../Constants';
import Contract from './Contract';

// convert a set of strings to map to an enum type, throw if any of them is not a legal value
export function checkConvertToEnum<T>(values: string[], enumObj: T): T[keyof T][] {
    const result: T[keyof T][] = [];

    for (const value of values) {
        if (Object.values(enumObj).indexOf(value.toLowerCase()) >= 0) {
            result.push(value as T[keyof T]);
        } else {
            throw new Error(`Invalid value for enum: ${value}`);
        }
    }

    return result;
}

export const isArena = (location: LocationFilter) => {
    switch (location) {
        case Location.GroundArena:
        case Location.SpaceArena:
        case WildcardLocation.AnyArena:
            return true;
        default:
            return false;
    }
};

export const isAttackableLocation = (location: LocationFilter) => {
    switch (location) {
        case Location.GroundArena:
        case Location.SpaceArena:
        case WildcardLocation.AnyArena:
        case Location.Base:
            return true;
        default:
            return false;
    }
};

// return true if the card location matches one of the allowed location filters
export const cardLocationMatches = (cardLocation: Location, locationFilter: LocationFilter | LocationFilter[]) => {
    if (!Array.isArray(locationFilter)) {
        locationFilter = [locationFilter];
    }

    return locationFilter.some((allowedLocation) => {
        switch (allowedLocation) {
            case WildcardLocation.Any:
                return true;
            case WildcardLocation.AnyArena:
                return isArena(cardLocation);
            case WildcardLocation.AnyAttackable:
                return isAttackableLocation(cardLocation);
            default:
                return cardLocation === allowedLocation;
        }
    });
};

export const isUnit = (cardType: CardTypeFilter) => {
    switch (cardType) {
        case WildcardCardType.Unit:
        case CardType.NonLeaderUnit:
        case CardType.LeaderUnit:
        case CardType.TokenUnit:
            return true;
        default:
            return false;
    }
};

export const isToken = (cardType: CardTypeFilter) => {
    switch (cardType) {
        case WildcardCardType.Token:
        case CardType.TokenUpgrade:
        case CardType.TokenUnit:
            return true;
        default:
            return false;
    }
};

// return true if the card location matches one of the allowed location filters
export const cardTypeMatches = (cardType: CardType, cardTypeFilter: CardTypeFilter | CardTypeFilter[]) => {
    if (!Array.isArray(cardTypeFilter)) {
        cardTypeFilter = [cardTypeFilter];
    }

    return cardTypeFilter.some((allowedCardType) => {
        switch (allowedCardType) {
            case WildcardCardType.Any:
                return true;
            case WildcardCardType.Unit:
                return isUnit(cardType);
            case WildcardCardType.Token:
                return isToken(cardType);
            default:
                return cardType === allowedCardType;
        }
    });
};

export const getCardTypesForFilter = (cardTypeFilter: CardTypeFilter): CardType[] => {
    switch (cardTypeFilter) {
        case WildcardCardType.Any:
            return [CardType.Base, CardType.Event, CardType.Leader, CardType.NonLeaderUnit, CardType.Upgrade, CardType.TokenUnit, CardType.TokenUpgrade, CardType.LeaderUnit];
        case WildcardCardType.Unit:
            return [CardType.NonLeaderUnit, CardType.LeaderUnit, CardType.TokenUnit];
        case WildcardCardType.Token:
            return [CardType.TokenUnit, CardType.TokenUpgrade];
        default:
            return [cardTypeFilter];
    }
};