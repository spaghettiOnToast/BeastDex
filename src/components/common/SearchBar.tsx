import type { FormEvent } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Search } from "lucide-react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void | Promise<void>;
};

export default function SearchBar({ value, onChange, onSubmit }: Props) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = onSubmit();
    if (result instanceof Promise) {
      result.catch((error) => {
        console.error("Search submission failed", error);
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex justify-start w-full max-w-xl lg:max-w-3xl"
    >
      <div className="relative flex-1">
        <Input
          type="text"
          placeholder="Search..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 sm:px-4 py-2 pr-10 sm:pr-11 text-sm border-gray-700 bg-gray-900 text-gray-100 focus-visible:ring-2 focus-visible:ring-lsGreen focus-visible:border-lsGreen placeholder:text-gray-500"
        />
        <Button
          type="submit"
          size="sm"
          aria-label="Search beasts"
          className="absolute inset-y-0 right-1.5 sm:right-2 my-auto h-7 w-7 sm:h-8 sm:w-8 text-gray-300 hover:bg-gray-700 focus:ring-lsGreen"
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
