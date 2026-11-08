import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Champ de mot de passe avec un œil pour relire ce qu'on a tapé.
 *
 * Le bouton est en `type="button"` : sans cela, le cliquer soumettrait le
 * formulaire de connexion. L'œil natif d'Edge est masqué (`::-ms-reveal`),
 * sinon deux yeux se superposeraient.
 */
const PasswordInput = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<"input">, "type">>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    const libelle = visible ? "Masquer le mot de passe" : "Afficher le mot de passe";

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-10 [&::-ms-clear]:hidden [&::-ms-reveal]:hidden", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={libelle}
          aria-pressed={visible}
          title={libelle}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
