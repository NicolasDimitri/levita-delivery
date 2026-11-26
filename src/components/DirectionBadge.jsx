import { getDeliveryDirection } from '../../lib/deliveryDirection';
import { Badge } from '../lib/ui';

export default function DirectionBadge({ order }) {
  const direction = getDeliveryDirection(order);
  return (
    <Badge color={direction?.color || 'gray'}>
      {direction ? `Direção: ${direction.name}` : 'Direção indisponível'}
    </Badge>
  );
}
