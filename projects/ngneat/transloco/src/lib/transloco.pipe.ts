import { ChangeDetectorRef, Inject, OnDestroy, Optional, Pipe, PipeTransform } from '@angular/core';
import { TranslocoService } from './transloco.service';
import { HashMap, ProviderScope } from './types';
import { switchMap, take } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { TRANSLOCO_SCOPE } from './transloco-scope';
import { TRANSLOCO_LANG } from './transloco-lang';
import { shouldListenToLangChanges } from './shared';
import { LangResolver } from './lang-resolver';
import { ScopeResolver } from './scope-resolver';

@Pipe({
  name: 'transloco',
  pure: false
})
export class TranslocoPipe implements PipeTransform, OnDestroy {
  private subscription: Subscription | null = null;
  private lastValue: string | undefined;
  private lastKey: string | undefined;
  private listenToLangChange: boolean;
  private currentLang: string;
  private langResolver = new LangResolver();
  private scopeResolver = new ScopeResolver(this.translocoService);

  constructor(
    private translocoService: TranslocoService,
    @Optional() @Inject(TRANSLOCO_SCOPE) private providerScope: string | ProviderScope | null,
    @Optional() @Inject(TRANSLOCO_LANG) private providerLang: string | null,
    private cdr: ChangeDetectorRef
  ) {
    this.listenToLangChange = shouldListenToLangChanges(this.translocoService, this.providerLang);
  }

  transform(key: string, params?: HashMap | undefined, inlineLang?: string | undefined): string {
    if (!key) {
      return key;
    }

    const keyName = params ? `${key}${JSON.stringify(params)}` : key;

    if (keyName === this.lastKey) {
      return this.lastValue;
    }

    this.lastKey = keyName;
    this.subscription && this.subscription.unsubscribe();

    this.subscription = this.translocoService.langChanges$
      .pipe(
        switchMap(activeLang => {
          const lang = this.langResolver.resolve({
            inline: inlineLang,
            provider: this.providerLang,
            active: activeLang
          });

          let scope = this.scopeResolver.resolve({ inline: undefined, provider: this.providerScope });
          this.currentLang = this.langResolver.resolveFullLang(lang, scope);

          return this.translocoService._loadDependencies(this.currentLang);
        }),
        this.listenToLangChange ? source => source : take(1)
      )
      .subscribe(() => this.updateValue(key, params));

    return this.lastValue;
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  private updateValue(key: string, params?: HashMap | undefined) {
    const lang = this.langResolver.resolveLangBasedOnScope(this.currentLang);
    this.lastValue = this.translocoService.translate(key, params, lang);
    this.cdr.markForCheck();
  }
}
