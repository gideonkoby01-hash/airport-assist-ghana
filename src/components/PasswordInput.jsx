import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// A password box with a button to show what has been typed, so mistakes can be seen before saving. It starts hidden and stays
// shown or hidden until the eye is pressed again (so a new password and its confirmation can be compared side by side). It is
// hidden again whenever the screen is opened anew, and is announced to screen readers as a pressed / not pressed button.
// It takes the same props as Input; `className` goes on the box itself.
const PasswordInput = React.forwardRef(({ className, ...props }, ref) => {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input
        ref={ref}
        {...props}
        type={shown ? "text" : "password"}
        className={cn("pr-12", className)}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-label={shown ? "Hide password" : "Show password"}
        title={shown ? "Hide password" : "Show password"}
        className="absolute right-0 top-0 h-full w-11 grid place-items-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {shown ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export default PasswordInput;
