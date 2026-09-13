# Changelog

## [0.2.0](https://github.com/cadenya/widgets-ui-react/compare/v0.1.0...v0.2.0) (2026-09-09)


### Features

* forward exposed tool arguments to custom tool renderers ([#6](https://github.com/cadenya/widgets-ui-react/issues/6)) ([8cc7393](https://github.com/cadenya/widgets-ui-react/commit/8cc73939995551b4d320be941f10f19d914d9b1f))
* inline tool placement so tool cards persist in the conversation ([#8](https://github.com/cadenya/widgets-ui-react/issues/8)) ([03a4c92](https://github.com/cadenya/widgets-ui-react/commit/03a4c923dd5992bb555f552ecaba630fd75eef37))
* lock approval controls and show pending feedback while a decision submits ([#11](https://github.com/cadenya/widgets-ui-react/issues/11)) ([64a03e7](https://github.com/cadenya/widgets-ui-react/commit/64a03e7ee31df05422af64bbe711dcd6b9c75b7d))


### Bug Fixes

* keep a denied tool call denied when its result event follows ([#10](https://github.com/cadenya/widgets-ui-react/issues/10)) ([ebcf8c5](https://github.com/cadenya/widgets-ui-react/commit/ebcf8c5bd7f9fa15a5ff0ae7ae3941186a985861))
* never regress a tool call's terminal status on late or replayed events ([#4](https://github.com/cadenya/widgets-ui-react/issues/4)) ([59cbc0d](https://github.com/cadenya/widgets-ui-react/commit/59cbc0d374e16414f6dad4501a87eca59f414817))
* render no bubble for assistant messages without visible text ([#9](https://github.com/cadenya/widgets-ui-react/issues/9)) ([a80e506](https://github.com/cadenya/widgets-ui-react/commit/a80e50692e1536d2aba6a1a2bb376a543222e977))
* scope ToolActivity decision state to its tool call ([#12](https://github.com/cadenya/widgets-ui-react/issues/12)) ([3d90cf3](https://github.com/cadenya/widgets-ui-react/commit/3d90cf343145d733d3e02f0adcc658e9af9921e3))
* treat useConversation(null) as an idle state instead of stuck loading ([#3](https://github.com/cadenya/widgets-ui-react/issues/3)) ([bd929c7](https://github.com/cadenya/widgets-ui-react/commit/bd929c74495d5b423cbf1dfaf5957f1b0fabad99))

## 0.1.0 (2026-08-16)


### Features

* automate releases and npm publishing via OIDC ([b5a005c](https://github.com/cadenya/widgets-ui-react/commit/b5a005cef785ad2d1608c9f93254428f047f42f8))
* composer variants, bubble colors, Storybook, and Node-resolvable packaging ([#2](https://github.com/cadenya/widgets-ui-react/issues/2)) ([c60fdfb](https://github.com/cadenya/widgets-ui-react/commit/c60fdfb15ba8dad8a5b9bce08370667a3fa13ce6))
* page tools — bare tool handlers that let the widget drive the page ([0388701](https://github.com/cadenya/widgets-ui-react/commit/03887011ce5fb0b03a1313f07b160cdd4a900b91))
