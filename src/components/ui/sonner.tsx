import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      /* UN DIALOGUE MODAL RADIX COUPE LES CLICS HORS DE LUI : il pose
         `pointer-events: none` sur <body>, et la pile de notifications en
         hérite. « Retenir « … » comme tag ? » s'affichait donc sur l'analyse
         de document, mais ni « Retenir » ni « Non » ne répondaient. Les
         notifications reprennent ici leurs clics ; le dialogue, lui, ignore
         déjà un clic venu d'elles (`onInteractOutside`). */
      style={{ pointerEvents: 'auto' }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
