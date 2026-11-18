# API 文档

服务端以 [OpenAPI 初稿](./openapi.yaml) 作为接口定义来源。本目录保存鉴权、错误码、幂等规则、分页约定和跨端联调说明。

接口设计原则：

- 所有业务接口通过 HTTPS 提供 JSON 数据。
- 用户身份、角色和数据范围由服务端校验。
- 确认、提交、审核和发布接口支持幂等控制。
- 时间由服务端生成并统一保存，客户端只负责展示。

开发前必须同时阅读：

- [接口通用约定](./conventions.md)
- [错误码](./error-codes.md)
- [V1.0 需求追踪矩阵](./traceability.md)
- [数据模型](../architecture/data-model.md)
- [角色与权限矩阵](../product/permission-matrix.md)
- [业务状态机](../product/state-machines.md)

`openapi.yaml` 是 V1.0 初始契约。实现过程中如果修改路径、字段、权限或状态值，必须先更新契约及关联产品文档，再修改代码。

