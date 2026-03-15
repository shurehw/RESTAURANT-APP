import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, MessageSquare } from 'lucide-react';

interface ReviewEntry {
  source: string;
  rating: number;
  snippet: string;
  date: string;
}

interface ReviewsSectionProps {
  reviews: ReviewEntry[];
  avgRating: number | null;
  count: number;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${
            i < rating ? 'fill-brass text-brass' : 'text-muted-foreground/30'
          }`}
        />
      ))}
    </span>
  );
}

export function ReviewsSection({ reviews, avgRating, count }: ReviewsSectionProps) {
  return (
    <Card className="print:border-0 print:shadow-none print:p-0">
      <CardHeader className="pb-3 print:pb-1 print:px-0">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-brass" />
            Recent Reviews
          </span>
          <span className="flex items-center gap-2">
            {avgRating != null && (
              <Badge variant="brass" className="gap-1">
                <Star className="h-3 w-3 fill-current" />
                {avgRating.toFixed(1)}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {count} in last 7 days
            </Badge>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="print:px-0">
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No recent reviews</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((review, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-md border border-border p-3 print:border-gray-300"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <StarRating rating={review.rating} />
                    <span className="text-xs text-muted-foreground">{review.source}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(review.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground line-clamp-2 print:line-clamp-none">
                    {review.snippet}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
