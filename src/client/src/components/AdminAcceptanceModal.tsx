import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const POLICY_VERSION = "1.0";
const TERMS_VERSION = "1.0";
const PRIVACY_VERSION = "1.0";

interface AdminAcceptanceModalProps {
  isOpen: boolean;
  onAccept: () => Promise<void>;
  isLoading?: boolean;
}

export function AdminAcceptanceModal({ isOpen, onAccept, isLoading = false }: AdminAcceptanceModalProps) {
  const [agreed, setAgreed] = useState(false);

  const handleAccept = async () => {
    if (!agreed) return;
    await onAccept();
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}} modal={true}>
      <DialogContent className="sm:max-w-2xl" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Accept Terms Before Continuing</DialogTitle>
          <DialogDescription>
            You must accept our Terms of Use and Privacy Policy to access the admin panel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-96 overflow-y-auto">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Terms of Use</CardTitle>
              <CardDescription>Version {TERMS_VERSION}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                By using the admin panel, you agree to our{" "}
                <a href="/terms" target="_blank" rel="noreferrer" className="underline hover:text-primary">
                  Terms of Use
                </a>
                . This includes compliance with all usage restrictions, intellectual property rights, and dispute
                resolution terms.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Privacy Policy</CardTitle>
              <CardDescription>Version {PRIVACY_VERSION}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                You acknowledge our{" "}
                <a href="/privacy" target="_blank" rel="noreferrer" className="underline hover:text-primary">
                  Privacy Policy
                </a>
                . Your actions will be logged for audit purposes, and session data may be collected for debugging and
                security.
              </p>
            </CardContent>
          </Card>

          <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
            <Checkbox id="accept-all" checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} />
            <label htmlFor="accept-all" className="cursor-pointer text-sm">
              <span className="font-medium">I have read and agree to the Terms of Use and Privacy Policy.</span>
              <p className="text-muted-foreground">
                I understand that my admin actions will be audited and tracked.
              </p>
            </label>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button onClick={handleAccept} disabled={!agreed || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            I Agree & Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
