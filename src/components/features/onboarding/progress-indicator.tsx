interface ProgressIndicatorProps {
  step: number;
  totalSteps: number;
}

export default function ProgressIndicator({ step, totalSteps }: ProgressIndicatorProps) {
  const progressPercentage = (step / totalSteps) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          Krok {step} z {totalSteps}
        </span>
        <span className="text-neutral-600 dark:text-neutral-400">{Math.round(progressPercentage)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-full bg-primary transition-all duration-300 ease-in-out"
          style={{ width: `${progressPercentage}%` }}
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
        />
      </div>
    </div>
  );
}
