import { BaseExpr, IExpr , into, IntoExpr} from "./index";

export class Operator extends BaseExpr implements IExpr {
  public operator: string;
  public args: IExpr[];

  public constructor(operator: string, args: IntoExpr[]) {
    super();
    this.operator = operator;
    this.args = args.map(into);
  }

  public resolve(mapping: Map<string, string>): Operator {
    return new Operator(this.operator, this.args.map((arg) => arg.resolve(mapping)));
  }
}
