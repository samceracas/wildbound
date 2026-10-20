import { useQueryClient } from "@tanstack/react-query";
import { KeyRoundIcon, SettingsIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { API_URL, getToken, setToken } from "@/lib/api";
import { keys } from "@/lib/queries";

/** Editor token (shared with the Map Editor via localStorage `wildbound.editorToken`). */
export function TokenSettings() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(getToken);
  const save = () => {
    setToken(value.trim());
    void qc.invalidateQueries({ queryKey: keys.all });
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(getToken());
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start">
          <SettingsIcon /> Settings
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-80">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="editor-token">
              <KeyRoundIcon className="size-3.5" /> Editor token
            </Label>
            <Input
              id="editor-token"
              type="password"
              autoComplete="off"
              placeholder="EDITOR_TOKEN from .env"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="text-xs text-muted">
              Stored in this browser and shared with the Map Editor. Falls back to <code>VITE_EDITOR_TOKEN</code>.
            </p>
          </div>
          <p className="truncate text-xs text-faint" title={API_URL}>
            API: {API_URL}
          </p>
          <div className="flex justify-end">
            <Button type="submit" size="sm">
              Save token
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
