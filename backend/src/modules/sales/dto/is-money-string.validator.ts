import { registerDecorator, type ValidationOptions } from "class-validator";

export function IsMoneyString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isMoneyString",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === "string" && /^\d+\.\d{2}$/.test(value);
        },
      },
    });
  };
}
