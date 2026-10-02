import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/* shadcn/ui's Button, in the forwardRef form React 18 needs (the current
   shadcn registry passes `ref` as a prop, which React 18 drops — and a Radix
   trigger rendered `asChild` over this button would then lose its anchor). */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-13 font-medium transition-colors '
    + 'disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 '
    + 'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground font-semibold hover:brightness-110',
        outline: 'border border-border bg-transparent text-foreground hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
        destructive: 'bg-destructive text-white hover:brightness-110',
        link: 'text-primary underline-offset-4 hover:underline',
        pill: 'rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-accent',
      },
      size: {
        default: 'h-9 px-3.5',
        sm: 'h-8 px-3 text-tiny',
        xs: 'h-7 px-2.5 text-tiny',
        lg: 'h-10 px-5',
        icon: 'size-9 rounded-full',
      },
    },
    defaultVariants: { variant: 'outline', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
