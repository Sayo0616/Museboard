import { Input } from "../ui/Input";

type PropertyFieldProps = {
  label: string;
  value: string | number;
  type?: "text" | "number";
  onChange: (value: string | number) => void;
};

export function PropertyField({ label, value, type = "text", onChange }: PropertyFieldProps) {
  return (
    <label className="property-field">
      <span>{label}</span>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(type === "number" ? Number(event.target.value) : event.target.value)}
      />
    </label>
  );
}
