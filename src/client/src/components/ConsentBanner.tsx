import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { storeConsent, getCategoriesForChoice, type ConsentChoice, type ConsentCategory } from "@/lib/consent";

const POLICY_VERSION = "1.0";

interface ConsentBannerProps {
  isOpen: boolean;
  onClose: () => void;
  jurisdiction: string | null;
}

export function ConsentBanner({ isOpen, onClose, jurisdiction }: ConsentBannerProps) {
  const [showManage, setShowManage] = useState(false);
  const [customCategories, setCustomCategories] = useState<ConsentCategory[]>([
    "essential",
    "analytics",
  ]);

  const handleChoice = (choice: ConsentChoice) => {
    const categories = choice === "custom" ? customCategories : getCategoriesForChoice(choice);

    storeConsent({
      timestamp: new Date().toISOString(),
      jurisdiction_detected: jurisdiction,
      policy_version: POLICY_VERSION,
      categories_accepted: categories,
      user_action: choice,
    });

    // Dispatch event to notify LogRocketBridge that consent has changed
    window.dispatchEvent(new Event("consent-granted"));
    
    onClose();
  };

  const handleCustomToggle = (category: ConsentCategory) => {
    setCustomCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent data-testid="consent-banner" className="sm:max-w-md">
        {!showManage ? (
          <>
            <DialogHeader>
              <DialogTitle>We Use Cookies & Tracking</DialogTitle>
              <DialogDescription>
                We use analytics and session monitoring to improve your experience. See our{" "}
                <a href="/tracking" target="_blank" rel="noreferrer" className="underline hover:text-primary">
                  Tracking Notice
                </a>{" "}
                for details.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <Button variant="outline" onClick={() => handleChoice("reject_all")} className="w-full">
                Reject All
              </Button>
              <Button variant="outline" onClick={() => setShowManage(true)} className="w-full">
                Manage Preferences
              </Button>
              <Button onClick={() => handleChoice("accept_all")} className="w-full">
                Accept All
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Manage Preferences</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox id="essential" checked={true} disabled />
                <label htmlFor="essential" className="cursor-not-allowed text-sm">
                  Essential (Always On)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="analytics"
                  checked={customCategories.includes("analytics")}
                  onCheckedChange={() => handleCustomToggle("analytics")}
                />
                <label htmlFor="analytics" className="cursor-pointer text-sm">
                  Analytics & Performance
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowManage(false)} className="flex-1">
                Back
              </Button>
              <Button onClick={() => handleChoice("custom")} className="flex-1">
                Save
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
